const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const app = express();
const uploadDir = path.join(__dirname, 'data', 'uploads');
const dbPath = path.join(__dirname, 'data', 'app.db');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(xlsx|xls|xlsm)$/i)) {
      return cb(new Error('Apenas arquivos Excel são permitidos.'));
    }
    cb(null, true);
  }
});

function runDbStatement(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function ensureColumn(tableName, columnName, definition) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) {
        return reject(err);
      }

      const existe = (rows || []).some((row) => row.name === columnName);
      if (existe) {
        return resolve();
      }

      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`, (alterErr) => {
        if (alterErr) {
          return reject(alterErr);
        }
        resolve();
      });
    });
  });
}

async function initializeDatabase() {
  await runDbStatement(`
    CREATE TABLE IF NOT EXISTS diagnosticas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turma_id TEXT NOT NULL,
      data_avaliacao TEXT NOT NULL,
      arquivo_original TEXT NOT NULL,
      observacao TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runDbStatement(`
    CREATE TABLE IF NOT EXISTS diagnostica_capacidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diagnostica_id INTEGER NOT NULL,
      capacidade TEXT NOT NULL,
      subfuncao TEXT,
      padrao_desempenho TEXT,
      percentual_desenvolvimento REAL NOT NULL,
      descricao TEXT,
      FOREIGN KEY(diagnostica_id) REFERENCES diagnosticas(id)
    )
  `);

  await runDbStatement(`
    CREATE TABLE IF NOT EXISTS diagnostica_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diagnostica_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      opcao_mais_errada TEXT NOT NULL,
      percentual REAL NOT NULL,
      FOREIGN KEY(diagnostica_id) REFERENCES diagnosticas(id)
    )
  `);

  await runDbStatement(`
    CREATE TABLE IF NOT EXISTS diagnostica_desempenho (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diagnostica_id INTEGER NOT NULL,
      aluno TEXT NOT NULL,
      capacidade TEXT NOT NULL,
      acerto REAL NOT NULL,
      erro REAL NOT NULL,
      FOREIGN KEY(diagnostica_id) REFERENCES diagnosticas(id)
    )
  `);

  await runDbStatement(`
    CREATE TABLE IF NOT EXISTS historico_escolar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turma_id TEXT NOT NULL,
      registro_id TEXT NOT NULL UNIQUE,
      ano TEXT NOT NULL,
      nota_geral_escola REAL,
      nota_prova_objetiva REAL,
      nota_prova_pratica REAL,
      segmento TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('diagnosticas', 'observacao', 'TEXT');
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco:', err.message);
    return;
  }

  initializeDatabase()
    .then(() => {
      console.log('Banco inicializado com sucesso.');
    })
    .catch((error) => {
      console.error('Erro ao inicializar o banco:', error.message);
    });
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function normalizeSheetName(name) {
  return String(name || '').trim().toLowerCase();
}

function getSheetByName(workbook, expectedNames) {
  const sheetNames = workbook.SheetNames || [];
  const normalized = expectedNames.map(normalizeSheetName);
  const match = sheetNames.find((name) => normalized.includes(normalizeSheetName(name)));
  if (!match) {
    throw new Error(`Aba não encontrada. Esperadas: ${expectedNames.join(', ')}`);
  }
  return workbook.Sheets[match];
}

function toArrayOfObjects(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return Array.isArray(rows) ? rows : [];
}

function parsePercent(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const texto = String(value).trim().replace('%', '').replace(',', '.');
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function getCellValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return '';
}

function extractCriticalCapacidades(rows) {
  return rows
    .filter((row) => {
      const perc = parsePercent(getCellValue(row, ['% Desenvolvimento', '% desenvolvimento', 'percentual', 'Percentual']));
      return perc !== null && perc < 65;
    })
    .map((row) => ({
      capacidade: getCellValue(row, ['Capacidade', 'capacidade']),
      subfuncao: getCellValue(row, ['Subfunção', 'Subfuncao', 'subfuncao']),
      padraoDesempenho: getCellValue(row, ['Padrão de Desempenho', 'Padrao de Desempenho', 'padrao_desempenho']),
      percentualDesenvolvimento: parsePercent(getCellValue(row, ['% Desenvolvimento', '% desenvolvimento', 'percentual', 'Percentual']))
    }));
}

function extractItensAnalysis(rows) {
  const itens = [];
  rows.forEach((row) => {
    const item = getCellValue(row, ['Item', 'item']);
    if (!item) return;

    const optionKeys = Object.keys(row).filter((key) => /^(A|B|C|D|E|F)\b/i.test(String(key).trim()));
    const valores = optionKeys
      .map((key) => ({ option: String(key).trim(), percentual: parsePercent(row[key]) }))
      .filter((entry) => entry.percentual !== null);

    if (valores.length === 0) return;

    const maior = valores.reduce((acc, itemAtual) => {
      if (!acc) return itemAtual;
      return itemAtual.percentual > acc.percentual ? itemAtual : acc;
    }, null);

    if (maior) {
      itens.push({
        item,
        opcaoMaisErrada: maior.option,
        percentual: maior.percentual
      });
    }
  });
  return itens;
}

function extractDetalhesDescritivos(rows) {
  return rows
    .map((row) => ({
      capacidade: getCellValue(row, ['Capacidade', 'capacidade']),
      descricao: getCellValue(row, ['Descrição', 'descricao', 'Texto', 'texto'])
    }))
    .filter((row) => row.capacidade || row.descricao);
}

function extractDesempenhoIndividual(rows) {
  const alunos = [];
  const colunas = Object.keys(rows[0] || {});
  const capacidadeColumns = colunas.filter((col) => !['Aluno', 'aluno', 'Nome', 'nome'].includes(col));
  rows.forEach((row) => {
    const aluno = getCellValue(row, ['Aluno', 'aluno', 'Nome', 'nome']);
    if (!aluno) return;

    const capacidades = capacidadeColumns
      .map((col) => {
        const valor = parsePercent(row[col]);
        return { capacidade: col, acerto: valor, erro: valor === null ? null : 100 - valor };
      })
      .filter((item) => item.acerto !== null)
      .filter((item) => item.acerto < 50)
      .slice(0, 5);

    if (capacidades.length > 0) {
      alunos.push({ aluno, capacidades });
    }
  });
  return alunos;
}

async function buscarCapacidadesCriticasPorTurma(turmaId, recorrentesOnly = false) {
  const recorrentes = String(recorrentesOnly || '').toLowerCase() === 'true';
  const rows = await runQuery(`
    SELECT capacidade, COUNT(DISTINCT diagnostica_id) AS recorrencias
    FROM diagnostica_capacidades
    WHERE diagnostica_id IN (
      SELECT id FROM diagnosticas WHERE turma_id = ?
    )
    GROUP BY capacidade
    ${recorrentes ? 'HAVING COUNT(DISTINCT diagnostica_id) >= 2' : ''}
    ORDER BY recorrencias DESC, capacidade ASC
  `, [turmaId]);

  return rows.map((row) => ({
    capacidade: row.capacidade,
    recorrencias: Number(row.recorrencias || 0)
  }));
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function runInsert(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

app.get('/api/turmas/:id/capacidades-criticas/objetivas', async (req, res) => {
  try {
    const capacidades = await buscarCapacidadesCriticasPorTurma(req.params.id, req.query.recorrentes);
    res.json(capacidades);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar capacidades críticas objetivas.', details: error.message });
  }
});

app.get('/api/turmas/:id/capacidades-criticas/praticas', async (req, res) => {
  try {
    const capacidades = await buscarCapacidadesCriticasPorTurma(req.params.id, req.query.recorrentes);
    res.json(capacidades);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar capacidades críticas práticas.', details: error.message });
  }
});

app.post('/api/turmas/:id/diagnosticas', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const { dataAvaliacao, observacao = '' } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo Excel é obrigatório.' });
  }

  if (!dataAvaliacao) {
    return res.status(400).json({ error: 'A data da avaliação é obrigatória.' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const cruzamentoSheet = getSheetByName(workbook, ['D. por competência - cruzamento', 'D. por competência - cruzamento ']);
    const itensSheet = getSheetByName(workbook, ['D. por competências - itens', 'D. por competências - itens ']);
    const detalhesSheet = getSheetByName(workbook, ['D. por competência detalhes', 'D. por competencia detalhes', 'D. por competência - detalhes']);
    const desempenhoSheet = getSheetByName(workbook, ['Desempenho individual', 'Desempenho Individual']);

    const cruzamentoRows = toArrayOfObjects(cruzamentoSheet);
    const itensRows = toArrayOfObjects(itensSheet);
    const detalhesRows = toArrayOfObjects(detalhesSheet);
    const desempenhoRows = toArrayOfObjects(desempenhoSheet);

    const capacidadesCriticas = extractCriticalCapacidades(cruzamentoRows);
    const analiseItens = extractItensAnalysis(itensRows);
    const detalhesDescritivos = extractDetalhesDescritivos(detalhesRows);
    const alunosBaixoDesempenho = extractDesempenhoIndividual(desempenhoRows);

    const diagnosticaId = await runInsert(
      'INSERT INTO diagnosticas (turma_id, data_avaliacao, arquivo_original, observacao) VALUES (?, ?, ?, ?)',
      [id, dataAvaliacao, req.file.filename, observacao]
    );

    const statements = [];
    capacidadesCriticas.forEach((item) => {
      statements.push(runInsert(
        'INSERT INTO diagnostica_capacidades (diagnostica_id, capacidade, subfuncao, padrao_desempenho, percentual_desenvolvimento, descricao) VALUES (?, ?, ?, ?, ?, ?)',
        [diagnosticaId, item.capacidade, item.subfuncao, item.padraoDesempenho, item.percentualDesenvolvimento, '']
      ));
    });

    analiseItens.forEach((item) => {
      statements.push(runInsert(
        'INSERT INTO diagnostica_itens (diagnostica_id, item, opcao_mais_errada, percentual) VALUES (?, ?, ?, ?)',
        [diagnosticaId, item.item, item.opcaoMaisErrada, item.percentual]
      ));
    });

    detalhesDescritivos.forEach((item) => {
      statements.push(runInsert(
        'INSERT INTO diagnostica_desempenho (diagnostica_id, aluno, capacidade, acerto, erro) VALUES (?, ?, ?, ?, ?)',
        [diagnosticaId, '', item.capacidade, 0, 0]
      ));
    });

    alunosBaixoDesempenho.forEach((item) => {
      item.capacidades.forEach((capacidade) => {
        statements.push(runInsert(
          'INSERT INTO diagnostica_desempenho (diagnostica_id, aluno, capacidade, acerto, erro) VALUES (?, ?, ?, ?, ?)',
          [diagnosticaId, item.aluno, capacidade.capacidade, capacidade.acerto, capacidade.erro]
        ));
      });
    });

    await Promise.all(statements);

    res.json({
      ok: true,
      diagnosticaId,
      capacidadesCriticas,
      analiseItens,
      alunosBaixoDesempenho,
      detalhesDescritivos
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Erro ao processar o arquivo Excel.', details: error.message });
  }
});

app.get('/api/turmas/:id/diagnosticas', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT id, turma_id, data_avaliacao, arquivo_original, observacao, criado_em FROM diagnosticas WHERE turma_id = ? ORDER BY data_avaliacao DESC, id DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar avaliações.', details: error.message });
  }
});

app.get('/api/turmas/:id/diagnosticas/:diagnosticaId/detalhes', async (req, res) => {
  try {
    const diagnosticaId = req.params.diagnosticaId;
    const capacidades = await runQuery(
      'SELECT capacidade, subfuncao, padrao_desempenho, percentual_desenvolvimento FROM diagnostica_capacidades WHERE diagnostica_id = ? ORDER BY percentual_desenvolvimento ASC',
      [diagnosticaId]
    );
    const itens = await runQuery(
      'SELECT item, opcao_mais_errada, percentual FROM diagnostica_itens WHERE diagnostica_id = ? ORDER BY percentual DESC',
      [diagnosticaId]
    );
    const desempenho = await runQuery(
      'SELECT aluno, capacidade, acerto, erro FROM diagnostica_desempenho WHERE diagnostica_id = ? ORDER BY aluno, capacidade',
      [diagnosticaId]
    );
    res.json({ capacidades, itens, desempenho });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar detalhes.', details: error.message });
  }
});

app.get('/turmas/:id/historico-escola', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT id, turma_id, registro_id, ano, nota_geral_escola, nota_prova_objetiva, nota_prova_pratica, segmento, criado_em, atualizado_em FROM historico_escolar WHERE turma_id = ? ORDER BY CAST(ano AS INTEGER) DESC, atualizado_em DESC',
      [req.params.id]
    );

    res.json(rows.map((row) => ({
      id: row.registro_id,
      turmaId: row.turma_id,
      ano: row.ano,
      notaGeralEscola: row.nota_geral_escola,
      notaProvaObjetiva: row.nota_prova_objetiva,
      notaProvaPratica: row.nota_prova_pratica,
      segmento: row.segmento,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em
    })));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter histórico escolar.', details: error.message });
  }
});

app.post('/turmas/:id/historico-escola', async (req, res) => {
  try {
    const { registroId, ano, notaGeralEscola, notaProvaObjetiva, notaProvaPratica, segmento } = req.body || {};

    if (!req.params.id || !ano || !segmento) {
      return res.status(400).json({ error: 'Turma, ano e segmento são obrigatórios.' });
    }

    const existing = await runQuery('SELECT id FROM historico_escolar WHERE registro_id = ?', [registroId || '']);
    if (existing.length > 0) {
      await runDbStatement(
        'UPDATE historico_escolar SET turma_id = ?, ano = ?, nota_geral_escola = ?, nota_prova_objetiva = ?, nota_prova_pratica = ?, segmento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE registro_id = ?',
        [req.params.id, ano, notaGeralEscola ?? null, notaProvaObjetiva ?? null, notaProvaPratica ?? null, segmento, registroId]
      );
    } else {
      await runDbStatement(
        'INSERT INTO historico_escolar (turma_id, registro_id, ano, nota_geral_escola, nota_prova_objetiva, nota_prova_pratica, segmento) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.params.id, registroId, ano, notaGeralEscola ?? null, notaProvaObjetiva ?? null, notaProvaPratica ?? null, segmento]
      );
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar histórico escolar.', details: error.message });
  }
});

app.delete('/turmas/:id/historico-escola/:registroId', async (req, res) => {
  try {
    await runDbStatement('DELETE FROM historico_escolar WHERE registro_id = ?', [req.params.registroId]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover histórico escolar.', details: error.message });
  }
});

app.get('/escola/historico/:turmaId', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT id, turma_id, registro_id, ano, nota_geral_escola, nota_prova_objetiva, nota_prova_pratica, segmento, criado_em, atualizado_em FROM historico_escolar WHERE turma_id = ? ORDER BY CAST(ano AS INTEGER) DESC, atualizado_em DESC',
      [req.params.turmaId]
    );

    res.json(rows.map((row) => ({
      id: row.registro_id,
      turmaId: row.turma_id,
      ano: row.ano,
      notaGeralEscola: row.nota_geral_escola,
      notaProvaObjetiva: row.nota_prova_objetiva,
      notaProvaPratica: row.nota_prova_pratica,
      segmento: row.segmento,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em
    })));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter histórico escolar.', details: error.message });
  }
});

app.post('/escola/historico', async (req, res) => {
  try {
    const { turmaId, registroId, ano, notaGeralEscola, notaProvaObjetiva, notaProvaPratica, segmento } = req.body || {};

    if (!turmaId || !ano || !segmento) {
      return res.status(400).json({ error: 'Turma, ano e segmento são obrigatórios.' });
    }

    const existing = await runQuery('SELECT id FROM historico_escolar WHERE registro_id = ?', [registroId || '']);
    if (existing.length > 0) {
      await runDbStatement(
        'UPDATE historico_escolar SET ano = ?, nota_geral_escola = ?, nota_prova_objetiva = ?, nota_prova_pratica = ?, segmento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE registro_id = ?',
        [ano, notaGeralEscola ?? null, notaProvaObjetiva ?? null, notaProvaPratica ?? null, segmento, registroId]
      );
    } else {
      await runDbStatement(
        'INSERT INTO historico_escolar (turma_id, registro_id, ano, nota_geral_escola, nota_prova_objetiva, nota_prova_pratica, segmento) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [turmaId, registroId, ano, notaGeralEscola ?? null, notaProvaObjetiva ?? null, notaProvaPratica ?? null, segmento]
      );
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar histórico escolar.', details: error.message });
  }
});

app.delete('/escola/historico/:registroId', async (req, res) => {
  try {
    await runDbStatement('DELETE FROM historico_escolar WHERE registro_id = ?', [req.params.registroId]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover histórico escolar.', details: error.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
