export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { user, pass } = req.body || {};
  if (!user || !pass) return res.status(400).json({ error: "Informe usuario e senha" });

  const sheetId = process.env.GSHEET_ID || "1tTer4utYD1im-3d8Ts_NAR0T4tnt5HKU5FwPieWxS3U";
  const key = process.env.GDRIVE_API_KEY;

  try {
    let rows = [];
    // Tenta buscar via export CSV publico (nao exige ativar Google Sheets API se a planilha estiver compartilhada com o link)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const rCsv = await fetch(csvUrl, { redirect: "follow" });

    if (rCsv.ok && (rCsv.headers.get("content-type") || "").includes("text/csv")) {
      const text = await rCsv.text();
      rows = parseCSV(text);
    } else if (key) {
      // Fallback: Google Sheets API v4
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:J500?key=${key}`;
      const rApi = await fetch(apiUrl);
      const jApi = await rApi.json();
      if (!rApi.ok) {
        return res.status(500).json({
          error: "Nao foi possivel ler a planilha. Compartilhe a planilha como 'Qualquer pessoa com o link (Leitor)'."
        });
      }
      rows = jApi.values || [];
    } else {
      return res.status(500).json({
        error: "Compartilhe a planilha como 'Qualquer pessoa com o link (Leitor)'."
      });
    }

    if (rows.length < 2) {
      return res.status(401).json({ error: "Planilha vazia ou sem dados" });
    }

    // Colunas: A=CLIENTE(0), B=VALOR(1), C=DATA VENCIMENTO(2), D=STATUS(3), E=USUARIO(4), F=SENHA(5)
    const uClean = String(user).trim();
    const pClean = String(pass).trim();

    let found = null;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 6) continue;
      const rUser = String(row[4] || "").trim();
      const rPass = String(row[5] || "").trim();
      if (rUser && rUser === uClean && rPass === pClean) {
        found = {
          cliente: String(row[0] || "").trim(),
          vencimento: String(row[2] || "").trim(),
          status: String(row[3] || "").trim(),
          usuario: rUser
        };
        break;
      }
    }

    if (!found) {
      return res.status(401).json({ error: "Usuario ou senha incorretos" });
    }

    const st = found.status.toLowerCase();
    if (st === "vencido" || st === "desistente" || st === "inativo" || st === "bloqueado") {
      return res.status(403).json({
        error: `Acesso bloqueado. Status da assinatura: ${found.status} (Vencimento: ${found.vencimento || "-"})`
      });
    }

    // Verifica data de vencimento (DD/MM/YYYY)
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(found.vencimento);
    if (m) {
      const day = +m[1], month = +m[2] - 1, year = +m[3];
      // Valido ate o fim do dia do vencimento (no fuso -03:00)
      const expTime = Date.UTC(year, month, day, 23, 59, 59) + 3 * 3600 * 1000;
      if (Date.now() > expTime) {
        return res.status(403).json({
          error: `Sua assinatura venceu em ${found.vencimento}. Entre em contato para renovar.`
        });
      }
    }

    return res.json({
      ok: true,
      user: {
        cliente: found.cliente,
        usuario: found.usuario,
        vencimento: found.vencimento,
        status: found.status
      }
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro ao verificar login: " + e.message });
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\r" && next === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i++; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else { cur += ch; }
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}
