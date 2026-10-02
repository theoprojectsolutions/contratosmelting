import asyncio, glob, json, time
from playwright.async_api import async_playwright
BASE='http://localhost:8765/index.html'
SEED = {
 'contratos':[
  dict(id='C-2026-101',cliente='ArcelorMittal Tubarão',grupo='ArcelorMittal',unidade='Tubarão',uf='ES',segmento='Siderurgia',quantidade_itens=0,itens_cotados=0,valor_cotado=0,itens_vencidos=0,vendedor_interno='Kayan',vendedor_externo='—',gerente='Gestor',data_inicio='2026-01-01',data_fim='2026-12-31',valor_contratado=900000,qtd_estimada=0,qtd_consumida=0,ncm='—',icms_divergencia=False,codigos_cliente=None),
  dict(id='C-2026-102',cliente='Trivium Packaging',grupo='Trivium',unidade='Matriz',uf='SP',segmento='Embalagens',quantidade_itens=0,itens_cotados=0,valor_cotado=0,itens_vencidos=0,vendedor_interno='Théo',vendedor_externo='—',gerente='Gestor',data_inicio='2024-12-01',data_fim='2025-11-30',valor_contratado=150000,qtd_estimada=0,qtd_consumida=0,ncm='—',icms_divergencia=False,codigos_cliente='003142'),
 ],
 'cotacoes':[
  dict(numero='COT-1',cliente='ArcelorMittal Tubarão',tipo='Renovação',data_recebimento='2026-08-01',data_envio='2026-08-09',itens_estimados=1240,itens_cotados=1045,valor_estimado=0,valor_cotado=880000,valor_contrato=0,status='Em negociação',motivo='Aguardando'),
  dict(numero='COT-2',cliente='Trivium Packaging',tipo='Renovação',data_recebimento='2026-06-01',data_envio='2026-06-04',itens_estimados=178,itens_cotados=150,valor_estimado=0,valor_cotado=140000,valor_contrato=0,status='Renovado',motivo='ok'),
  dict(numero='COT-3',cliente='Outro',tipo='Cliente novo',data_recebimento='2026-05-01',data_envio='2026-05-10',itens_estimados=50,itens_cotados=40,valor_estimado=0,valor_cotado=30000,valor_contrato=0,status='Perdido',motivo='preço'),
 ],
 'clientes':[], 'perfis':[{'id':'u1','email':'teste@melting.com.br','papel':'admin'}],
 'contrato_itens':[], 'de_para':[], 'parametros':[{'chave':'sistema','valor':{'ia':{'ativa':True,'loteItens':8}}}], 'produtos':[], 'vendas':[]
}
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={'width':1440,'height':1000})
    erros=[]
    pg.on('console', lambda m: erros.append(m.text) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: erros.append('PAGEERROR '+str(e)))
    mock=open(__import__('os').path.join(__import__('os').path.dirname(__file__),'mock-supabase.js')).read()
    await pg.route('**/@supabase/supabase-js@2', lambda r: r.fulfill(status=200, content_type='application/javascript', body=mock))
    await pg.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body=''))
    await pg.add_init_script('window.__TABELAS='+json.dumps(SEED)+';')
    await pg.goto(BASE); await pg.wait_for_timeout(1500)
    print('db status:', await pg.inner_text('#db-status-text'))
    await pg.screenshot(path='shots/01_dashboard_vazio.png', full_page=True)
    # Base de dados
    await pg.click('.nav-item[data-view="base"]')
    t=time.time()
    await pg.set_input_files('#base-cad-file', sorted(glob.glob('files/*cad_produtos*')))
    await pg.wait_for_function("document.getElementById('base-cad-status').textContent.includes('importados') || document.getElementById('base-cad-status').textContent.includes('Erro')", timeout=240000)
    print('cadastro:', await pg.inner_text('#base-cad-status'), round(time.time()-t),'s')
    await pg.set_input_files('#base-ven-file', ['files/relsitped.xls'])
    await pg.wait_for_function("document.getElementById('base-ven-status').textContent.includes('importadas') || document.getElementById('base-ven-status').textContent.includes('Erro')", timeout=60000)
    print('vendas:', await pg.inner_text('#base-ven-status'))
    await pg.wait_for_timeout(500)
    await pg.screenshot(path='shots/02_base.png', full_page=True)
    print('tabelas:', await pg.evaluate("Object.fromEntries(Object.entries(window.__TABELAS).map(([k,v])=>[k,v.length]))"))
    # Responder Arcelor
    await pg.click('.nav-item[data-view="responder"]')
    await pg.set_input_files('#rp-file', ['files/arcelor.xlsx'])
    await pg.wait_for_selector('#rp-config:not([hidden])')
    mapa = await pg.evaluate("[...document.querySelectorAll('#rp-mapa select')].map(s=>s.dataset.campo+'='+s.options[s.selectedIndex].text)")
    print('cabecalho linha', await pg.input_value('#rp-cab'), mapa)
    await pg.select_option('#rp-contrato', 'C-2026-101')
    await pg.screenshot(path='shots/03_responder_config.png', full_page=True)
    t=time.time()
    await pg.click('#rp-rodar')
    await pg.wait_for_selector('#rp-resultado:not([hidden])', timeout=180000)
    print('motor arcelor', round(time.time()-t),'s')
    print('resumo:', await pg.inner_text('#rp-contagem'), '|', (await pg.inner_text('#rp-resumo')).replace('\n',' '))
    await pg.screenshot(path='shots/04_responder_resultado.png', full_page=False)
    # aprovar altas, abrir troca de um item sem cadastro
    await pg.click('#rp-aprovar-altas')
    await pg.select_option('#rp-filtro','sem_cadastro')
    await pg.click('#tbl-rp tbody tr[data-i] button[data-acao="trocar"]')
    await pg.fill('.rp-troca input', 'UMI 16S 3/8 NPT')
    await pg.wait_for_timeout(600)
    await pg.screenshot(path='shots/05_troca.png', full_page=False)
    await pg.select_option('#rp-filtro','')
    await pg.click('#rp-salvar')
    await pg.wait_for_timeout(1500)
    print('itens salvos:', await pg.evaluate("window.__TABELAS.contrato_itens.length"), 'de_para', await pg.evaluate("window.__TABELAS.de_para.length"))
    # download
    async with pg.expect_download() as d:
      await pg.click('#rp-baixar')
    dl = await d.value; await dl.save_as('shots/arcelor_respondida.xlsx'); print('download ok', dl.suggested_filename)
    # Trivium
    await pg.click('.nav-item[data-view="responder"]')
    await pg.set_input_files('#rp-file', ['files/trivium.xlsx'])
    await pg.wait_for_selector('#rp-config:not([hidden])')
    mapa = await pg.evaluate("[...document.querySelectorAll('#rp-mapa select')].map(s=>s.dataset.campo+'='+s.options[s.selectedIndex].text)")
    print('trivium mapa', mapa)
    await pg.select_option('#rp-contrato', 'C-2026-102')
    await pg.click('#rp-rodar')
    await pg.wait_for_function("!document.getElementById('rp-resultado').hidden && document.getElementById('rp-contagem').textContent.includes('itens')", timeout=120000)
    await pg.wait_for_timeout(300)
    print('trivium resumo:', await pg.inner_text('#rp-contagem'), '|', (await pg.inner_text('#rp-resumo')).replace('\n',' '))
    print('botao IA:', await pg.inner_text('#rp-ia'), await pg.is_visible('#rp-ia'))
    await pg.click('#rp-ia')
    await pg.wait_for_function("window.__IA_CHAMADAS>=2 && document.getElementById('rp-progresso').hidden", timeout=60000)
    print('IA chamadas:', await pg.evaluate('window.__IA_CHAMADAS'), '| motivo exemplo:', await pg.evaluate("Intel.RP.itens.find(i=>!i.produto_id).motivo"))
    if await pg.is_visible('#rp-dica-codigos'):
      print('dica:', (await pg.inner_text('#rp-dica-codigos'))[:300])
      await pg.click('#rp-add-codigos'); await pg.wait_for_timeout(800)
    await pg.click('#rp-aprovar-altas'); await pg.click('#rp-salvar'); await pg.wait_for_timeout(1200)
    # detalhe do contrato Trivium
    await pg.evaluate("openContratoDetalhe('C-2026-102')"); await pg.wait_for_timeout(800)
    await pg.evaluate("document.getElementById('intel-contrato').scrollIntoView()"); await pg.wait_for_timeout(200)
    await pg.screenshot(path='shots/06_detalhe_trivium.png')
    print('detalhe kpis:', (await pg.inner_text('#intel-contrato .intel-kpis')).replace('\n',' | ')[:600])
    await pg.evaluate("openContratoDetalhe('C-2026-101')"); await pg.wait_for_timeout(500)
    await pg.evaluate("document.getElementById('intel-contrato').scrollIntoView()"); await pg.wait_for_timeout(200)
    await pg.screenshot(path='shots/07_detalhe_arcelor.png')
    # parâmetros
    await pg.click('.nav-item[data-view="parametros"]'); await pg.wait_for_timeout(300)
    await pg.fill('input[data-k="dataReferencia"]', '2025-06-01')
    await pg.click('#param-salvar'); await pg.wait_for_timeout(500)
    print('parametros salvos:', await pg.evaluate("JSON.stringify(window.__TABELAS.parametros).slice(0,200)"))
    await pg.screenshot(path='shots/08_parametros.png', full_page=True)
    await pg.click('.nav-item[data-view="visao-geral"]'); await pg.wait_for_timeout(500)
    await pg.screenshot(path='shots/09_dashboard.png', full_page=True)
    print('dash intel:', (await pg.inner_text('#intel-dashboard')).replace('\n',' | ')[:900])
    # dark mode
    await pg.click('#theme-toggle'); await pg.wait_for_timeout(300)
    await pg.screenshot(path='shots/10_dashboard_dark.png', full_page=True)
    await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(300)
    await pg.evaluate("document.getElementById('intel-dashboard').scrollIntoView()"); await pg.screenshot(path='shots/11_mobile.png')
    print('ERROS:', [e for e in erros if 'favicon' not in e][:20])
    await b.close()
asyncio.run(main())
