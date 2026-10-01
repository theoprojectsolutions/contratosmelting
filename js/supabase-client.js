// =====================================================================
// CONFIGURAÇÃO DO SUPABASE (compartilhada entre login.html e index.html)
// Pegue esses dados em: Supabase > Project Settings > API
// =====================================================================
const SUPABASE_URL = 'https://rbarvmaiagdnniefeooo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nfLikWu4U5t3mgJr-tR0aQ_ed94pwIP';

// Uso "var" (em vez de "const") de propósito aqui: no escopo de um
// <script> comum (não-module), "var" no nível mais alto vira uma
// propriedade de "window" automaticamente. Isso garante que tanto
// "supabaseClient" quanto "window.supabaseClient" funcionem nos outros
// arquivos (login.js e app.js), não importa como cada um faça a checagem.
var supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!window.supabase){
  console.error('Biblioteca do Supabase não carregou (verifique sua internet ou se o CDN foi bloqueado).');
} else if (!supabaseClient){
  console.error('Não foi possível criar o client do Supabase.');
}
