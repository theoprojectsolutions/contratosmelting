// O client do Supabase (supabaseClient) vem de js/supabase-client.js,
// carregado antes deste arquivo no login.html — configure suas chaves lá.

// Para onde o usuário vai depois de logar com sucesso
const REDIRECT_URL = 'index.html';

// =====================================================================
// ELEMENTOS
// =====================================================================
const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btn-login');
const errorBox = document.getElementById('form-error');
const errorText = document.getElementById('form-error-text');
const togglePass = document.getElementById('toggle-pass');
const forgotLink = document.getElementById('forgot-link');

// =====================================================================
// MOSTRAR / ESCONDER SENHA
// =====================================================================
togglePass.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
});

// =====================================================================
// MENSAGENS (erro / sucesso) — uma função só, sem deixar classe presa
// =====================================================================
function showMsg(type, msg){
  errorText.textContent = msg;
  errorBox.classList.remove('error', 'success');
  errorBox.classList.add(type, 'show');
}
function showError(msg){ showMsg('error', msg); }
function hideError(){ errorBox.classList.remove('show'); }
function setLoading(loading){
  btnLogin.disabled = loading;
  btnLogin.classList.toggle('loading', loading);
}

// Traduz os erros mais comuns do Supabase para uma mensagem amigável em pt-BR
function traduzErroSupabase(error){
  const msg = (error && error.message) || '';
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha inválidos.';
  if (msg.includes('Email not confirmed')) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  return msg || 'Não foi possível entrar. Tente novamente.';
}

// =====================================================================
// LOGIN (e-mail + senha)
// =====================================================================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password){
    showError('Preencha e-mail e senha para continuar.');
    return;
  }

  if (!supabaseClient){
    showError('Supabase ainda não configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY em js/supabase-client.js.');
    return;
  }

  setLoading(true);
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error){
      showError(traduzErroSupabase(error));
      setLoading(false);
      return;
    }

    // login ok — guarda a sessão (o supabase-js já persiste sozinho por padrão)
    if (document.getElementById('remember').checked){
      localStorage.setItem('melting_remember_email', email);
    } else {
      localStorage.removeItem('melting_remember_email');
    }

    window.location.href = REDIRECT_URL;
  } catch (err){
    showError('Erro inesperado ao conectar. Verifique sua internet e tente novamente.');
    setLoading(false);
  }
});

// =====================================================================
// "ESQUECI MINHA SENHA"
// =====================================================================
forgotLink.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  if (!email){
    showError('Digite seu e-mail acima e clique em "Esqueci minha senha" novamente.');
    emailInput.focus();
    return;
  }
  if (!supabaseClient){
    showError('Supabase ainda não configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY em js/supabase-client.js.');
    return;
  }
  hideError();
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
    if (error){
      showError(traduzErroSupabase(error));
    } else {
      showMsg('success', 'Enviamos um link de redefinição de senha para ' + email + '.');
    }
  } catch (err){
    showError('Não foi possível enviar o e-mail de redefinição agora.');
  }
});

// =====================================================================
// PREENCHE O E-MAIL SALVO (se "manter conectado" foi usado antes)
// =====================================================================
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('melting_remember_email');
  if (saved){
    emailInput.value = saved;
    document.getElementById('remember').checked = true;
    passwordInput.focus();
  } else {
    emailInput.focus();
  }
});

// =====================================================================
// (Opcional) Se já existir uma sessão válida, pula direto pro sistema.
// Descomente as linhas abaixo se quiser esse comportamento.
// =====================================================================
// supabaseClient?.auth.getSession().then(({ data }) => {
//   if (data.session) window.location.href = REDIRECT_URL;
// });
