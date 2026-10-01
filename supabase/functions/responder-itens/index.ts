// =====================================================================
// MELTING · FUNÇÃO "responder-itens" (Supabase Edge Function + Claude)
//
// Usada pelo botão "Pedir à IA" da tela Responder planilha, só para os
// itens que o motor local não resolveu. Dois passos por lote:
//   passo "consultas": a IA lê a descrição do cliente e escreve buscas no
//                      jeito Melting de descrever (apelido / descrição curta).
//                      O navegador procura essas buscas no catálogo.
//   passo "escolher":  a IA recebe os candidatos encontrados e escolhe um
//                      (ou nenhum, sugerindo como cadastrar).
//
// A chave da API fica só no servidor (segredo ANTHROPIC_API_KEY) — nunca
// vai para o navegador. Só usuários logados no sistema conseguem chamar
// (verificação de JWT padrão do Supabase).
//
// Publicar:  supabase functions deploy responder-itens
// Segredos:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//            (opcional) supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5
// =====================================================================

const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CONVENCOES = `
Você trabalha na Melting (Soluções em Manutenção Industrial), que vende mangueiras, terminais,
conexões hidráulicas, engates, correias e itens montados. Convenções do cadastro Melting:
- "Apelido" é um código compacto. Terminais de mangueira: {bitola da mangueira em dash}G{bitola da rosca em dash}{tipo}[45|90]SML.
  Tipos: FJX = fêmea giratória JIC 37°; FFORX = fêmea ORFS (sede plana); FBSPORX = fêmea BSP; FDLORX / FDHORX = fêmea DIN série L / S (DKO);
  MP = macho NPT; MBSPP = macho BSP; MJ = macho JIC; MLSP = ponta lisa; FL / FLH = flange código 61 / 62; FP = fêmea NPT fixa.
  Ex.: mangueira 3/8" com fêmea giratória JIC 9/16 UNF reta = 6G6FJXSML; 90° = 6G6FJX90SML.
- Adaptadores hidráulicos: {dash}{tipo}{dash}{tipo}[ângulo], ex.: 12MJ12MBSPP (macho JIC 1.1/16 x macho BSP 3/4), 8MJ4MP.
- Dash = polegada × 16 (1/4=4, 3/8=6, 1/2=8, 3/4=12, 1=16, 1.1/4=20, 1.1/2=24, 2=32). JIC: 7/16=4, 9/16=6, 3/4=8, 7/8=10, 1.1/16=12, 1.5/16=16, 1.5/8=20.
- Conexões de tubo (Ermeto/DIN, anilha 24°): UMA/UMI/UMC (união macho aço/inox/latão), UFA/UFI (fêmea), USA (solda), UDA/UDI (dupla),
  JIA/JMI (joelho), TIA/TII (tê), CII (cruzeta), PI (plug); número = diâmetro do tubo em mm, L = série leve, S = pesada; rosca métrica entre parênteses
  (ex.: "UMI 16S (M24) X 3/8 NPT INOX 316"). "C" na frente (CUMA) = só corpo, sem porca (PA) e anel (AA).
- Rosca NPT ≠ BSP ≠ UNF/JIC. Inox ≠ aço carbono ≠ latão ≠ PVC. Nunca troque padrão de rosca, material, tipo de peça ou medida.
`;

async function claude(sistema: string, usuario: string, maxTokens = 2500): Promise<string> {
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) throw new Error("ANTHROPIC_API_KEY não configurada nos segredos da função");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, system: sistema, messages: [{ role: "user", content: usuario }] }),
  });
  if (!r.ok) throw new Error(`API Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
}

function extrairJSON(txt: string): unknown {
  const ini = txt.indexOf("{"), fim = txt.lastIndexOf("}");
  if (ini < 0 || fim < ini) throw new Error("resposta da IA sem JSON");
  return JSON.parse(txt.slice(ini, fim + 1));
}

type Item = { descricao?: string; ref?: string; un?: string; candidatos?: { id: string; descricao: string; apelido: string }[] };

async function passoConsultas(itens: Item[]) {
  const sistema = CONVENCOES + `
Tarefa: para cada item do cliente, escreva de 2 a 4 buscas curtas (no máximo 60 caracteres cada) do jeito que o item
provavelmente está escrito no cadastro Melting: um apelido provável e descrições curtas com tipo, medida, rosca e material.
Responda SOMENTE com JSON: {"itens":[{"consultas":["...","..."]}, ...]} na mesma ordem dos itens.`;
  const usuario = itens.map((it, i) => `${i + 1}. ${(it.descricao || "").slice(0, 900)}${it.ref ? ` | REF: ${it.ref}` : ""}${it.un ? ` | UN: ${it.un}` : ""}`).join("\n");
  const j = extrairJSON(await claude(sistema, usuario)) as { itens?: { consultas?: string[] }[] };
  return { itens: itens.map((_, i) => ({ consultas: ((j.itens || [])[i]?.consultas || []).slice(0, 4).map((s) => String(s).slice(0, 80)) })) };
}

async function passoEscolher(itens: Item[]) {
  const sistema = CONVENCOES + `
Tarefa: para cada item do cliente, escolha entre os candidatos do cadastro o produto EQUIVALENTE (mesmo tipo de peça,
mesmas medidas, mesmo padrão de rosca, mesmo material, mesmas pontas). Se nenhum for equivalente, responda produto_id null
e escreva em "descricao_sugerida" como o item deveria ser cadastrado no padrão Melting (descrição curta + apelido provável).
Seja conservador: na dúvida, null.
Responda SOMENTE com JSON:
{"itens":[{"produto_id":"123"|null,"confianca":"alta"|"media"|"baixa","justificativa":"até 140 caracteres","descricao_sugerida":"..."}]}
na mesma ordem dos itens.`;
  const usuario = itens.map((it, i) => {
    const cands = (it.candidatos || []).slice(0, 20).map((c) => `   - ${c.id} | ${c.apelido} | ${c.descricao}`).join("\n");
    return `ITEM ${i + 1}: ${(it.descricao || "").slice(0, 900)}${it.ref ? ` | REF: ${it.ref}` : ""}\n  Candidatos:\n${cands || "   (nenhum)"}`;
  }).join("\n\n");
  const j = extrairJSON(await claude(sistema, usuario, 3500)) as { itens?: Record<string, unknown>[] };
  return {
    itens: itens.map((it, i) => {
      const e = (j.itens || [])[i] || {};
      const id = e.produto_id == null ? null : String(e.produto_id);
      // só aceita ID que estava entre os candidatos
      const valido = id && (it.candidatos || []).some((c) => String(c.id) === id) ? id : null;
      return {
        produto_id: valido,
        confianca: ["alta", "media", "baixa"].includes(String(e.confianca)) ? e.confianca : "baixa",
        justificativa: String(e.justificativa || "").slice(0, 200),
        descricao_sugerida: e.descricao_sugerida ? String(e.descricao_sugerida).slice(0, 200) : null,
      };
    }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { passo, itens } = await req.json();
    if (!Array.isArray(itens) || !itens.length) throw new Error("envie itens");
    if (itens.length > 25) throw new Error("no máximo 25 itens por chamada");
    const out = passo === "escolher" ? await passoEscolher(itens) : await passoConsultas(itens);
    return new Response(JSON.stringify(out), { headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
  }
});
