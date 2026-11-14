const API = "https://api.syncpayments.com.br/api/partner/v1";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

function validCpf(value) {
  const cpf = String(value || "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

async function getToken() {
  const client_id = process.env.SYNCPAY_CLIENT_ID;
  const client_secret = process.env.SYNCPAY_CLIENT_SECRET;
  if (!client_id || !client_secret) throw new Error("Credenciais SyncPay não configuradas no Netlify.");
  const response = await fetch(API + "/auth-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Falha na autenticação com a SyncPay.");
  const token = result.access_token || result.token || result.data?.access_token || result.data?.token;
  if (!token) throw new Error("A SyncPay não retornou o token de acesso.");
  return token;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Método não permitido." });
  try {
    const body = JSON.parse(event.body || "{}");
    const amountCents = Number(body.amount);
    const customer = body.customer || {};
    const name = String(customer.name || "").trim();
    const cpf = String(customer.cpf || customer.document || "").replace(/\D/g, "");
    const email = String(customer.email || "").trim();
    const phone = String(customer.phone || "").replace(/\D/g, "");

    if (!Number.isSafeInteger(amountCents) || amountCents < 1000 || amountCents > 100000000) {
      return json(400, { error: "Valor de doação inválido." });
    }
    if (name.length < 3 || name.length > 100 || !validCpf(cpf) ||
        email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        phone.length < 10 || phone.length > 13) {
      return json(400, { error: "Confira nome, CPF, e-mail e celular." });
    }

    const token = await getToken();
    const response = await fetch(API + "/cash-in", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        amount: Number((amountCents / 100).toFixed(2)),
        description: "Doação solidária",
        client: { name, cpf, email, phone }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("SyncPay cash-in error", response.status, JSON.stringify(result).slice(0, 1000));
      return json(502, { error: "A SyncPay não conseguiu gerar o PIX. Verifique a conta e tente novamente." });
    }
    const payload = result.data || result;
    const pixCode = payload.pix_code || payload.pixCode || payload.copy_paste || payload.qr_code;
    const identifier = payload.identifier || payload.transaction_id || payload.id;
    if (!pixCode || !identifier) {
      console.error("Unexpected SyncPay cash-in response", JSON.stringify(result).slice(0, 1000));
      return json(502, { error: "Resposta inesperada ao gerar o PIX." });
    }
    return json(200, { transactionId: String(identifier), pixCode: String(pixCode) });
  } catch (error) {
    console.error("create-pix error", error);
    return json(500, { error: error.message || "Erro interno ao gerar PIX." });
  }
}
