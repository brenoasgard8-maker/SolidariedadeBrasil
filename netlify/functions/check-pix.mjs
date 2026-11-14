const API = "https://api.syncpayments.com.br/api/partner/v1";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

async function getToken() {
  const client_id = process.env.SYNCPAY_CLIENT_ID;
  const client_secret = process.env.SYNCPAY_CLIENT_SECRET;
  if (!client_id || !client_secret) throw new Error("Credenciais SyncPay não configuradas.");
  const response = await fetch(API + "/auth-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Falha na autenticação SyncPay.");
  const token = result.access_token || result.token || result.data?.access_token || result.data?.token;
  if (!token) throw new Error("Token SyncPay ausente.");
  return token;
}

export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Método não permitido." });
  const identifier = event.queryStringParameters?.transactionId || "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(identifier)) return json(400, { error: "Identificador inválido." });
  try {
    const token = await getToken();
    const response = await fetch(API + "/transaction/" + encodeURIComponent(identifier), {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/json" }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(502, { error: "Não foi possível consultar o pagamento." });
    const payload = result.data || result;
    const rawStatus = String(payload.status || "").toLowerCase();
    return json(200, { status: rawStatus === "completed" ? "paid" : rawStatus });
  } catch (error) {
    console.error("check-pix error", error);
    return json(500, { error: "Erro ao consultar pagamento." });
  }
}
