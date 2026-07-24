const STORAGE_KEY = "turmasCadastradas";
const STORAGE_KEY_FINALIZADAS = "turmasFinalizadas";
const STORAGE_KEY_OCORRENCIAS = "ocorrenciasPedagogicas";
const STORAGE_KEY_ALUNOS = "alunosPorTurma";
const STORAGE_SYNC_REGISTRY_KEY = "__acompanhamentoSyncRegistry__";
const STORAGE_SYNC_STATIC_KEYS = [
    STORAGE_KEY,
    STORAGE_KEY_FINALIZADAS,
    "seeducTurmas",
    "seeducRegistros",
    "saepDatas",
    "saepAcoes",
    "saepAvaliacoesObjetivo",
    "saepAvaliacoesPratico",
    "saepSimuladosExcel",
    "saepPlataformasDados",
    "saepHistoricoIndicadores"
];
const STORAGE_SYNC_PREFIXES = [
    `${STORAGE_KEY_ALUNOS}_`,
    `${STORAGE_KEY_OCORRENCIAS}_`
];
const APP_SYNC_CONFIG = window.APP_SYNC_CONFIG || {};
const APP_SYNC_STATE = {
    enabled: Boolean(APP_SYNC_CONFIG.enabled && APP_SYNC_CONFIG.databaseURL),
    initialized: false,
    lastSerializedPayload: "",
    pendingTimeout: null,
    isSyncing: false
};

const SAEP_IMPORT_STORAGE_KEY = "saepSimuladosExcel";
const SAEP_PLATAFORMAS_STORAGE_KEY = "saepPlataformasDados";
const SAEP_HISTORICO_INDICADORES_STORAGE_KEY = "saepHistoricoIndicadores";
const SAEP_ABAS_OBRIGATORIAS = [
    "D. por Competência - Cruzamento",
    "D. por Competência - Itens",
    "D. por Competência - Detalhes",
    "Desempenho Individual - Detalhe"
];

function normalizarUrlSync(url) {
    return (url || "").replace(/\/+$/, "");
}

function obterUrlSyncRemoto() {
    if (!APP_SYNC_STATE.enabled) {
        return "";
    }

    const databaseURL = normalizarUrlSync(APP_SYNC_CONFIG.databaseURL);
    const namespace = (APP_SYNC_CONFIG.namespace || "acompanhamento-pedagogico").replace(/^\/+|\/+$/g, "");
    return `${databaseURL}/${namespace}.json`;
}

function carregarRegistroSyncLocal() {
    const dados = localStorage.getItem(STORAGE_SYNC_REGISTRY_KEY);

    if (!dados) {
        return [];
    }

    try {
        const chaves = JSON.parse(dados);
        return Array.isArray(chaves) ? chaves : [];
    } catch (error) {
        console.error("Erro ao carregar o registro de sincronização:", error);
        return [];
    }
}

function salvarRegistroSyncLocal(chaves) {
    const unicas = Array.from(new Set(chaves.filter(Boolean))).sort();
    localStorage.setItem(STORAGE_SYNC_REGISTRY_KEY, JSON.stringify(unicas));
}

function registrarChaveParaSync(storageKey) {
    if (!storageKey) {
        return;
    }

    const chaves = new Set([...STORAGE_SYNC_STATIC_KEYS, ...carregarRegistroSyncLocal()]);
    chaves.add(storageKey);
    salvarRegistroSyncLocal(Array.from(chaves));
}

function listarChavesSincronizaveis() {
    const chaves = new Set([...STORAGE_SYNC_STATIC_KEYS, ...carregarRegistroSyncLocal()]);

    Object.keys(localStorage).forEach((chave) => {
        if (STORAGE_SYNC_PREFIXES.some((prefixo) => chave.startsWith(prefixo))) {
            chaves.add(chave);
        }
    });

    chaves.delete(STORAGE_SYNC_REGISTRY_KEY);
    return Array.from(chaves);
}

function obterPayloadSyncLocal() {
    const dados = {};

    listarChavesSincronizaveis().forEach((chave) => {
        const valorCru = localStorage.getItem(chave);

        if (valorCru === null) {
            return;
        }

        try {
            dados[chave] = JSON.parse(valorCru);
        } catch (error) {
            dados[chave] = valorCru;
        }
    });

    return {
        updatedAt: new Date().toISOString(),
        keys: dados
    };
}

function aplicarPayloadSyncRemoto(payload) {
    if (!payload || typeof payload !== "object" || !payload.keys || typeof payload.keys !== "object") {
        return false;
    }

    const chavesRemotas = Object.keys(payload.keys);

    chavesRemotas.forEach((chave) => {
        localStorage.setItem(chave, JSON.stringify(payload.keys[chave]));
    });

    const chavesMescladas = Array.from(new Set([...listarChavesSincronizaveis(), ...chavesRemotas]));
    salvarRegistroSyncLocal(chavesMescladas);
    APP_SYNC_STATE.lastSerializedPayload = JSON.stringify(obterPayloadSyncLocal().keys);
    return true;
}

async function baixarDadosRemotos() {
    const url = obterUrlSyncRemoto();

    if (!url) {
        return false;
    }

    const resposta = await fetch(url, { cache: "no-store" });

    if (!resposta.ok) {
        throw new Error(`Falha ao carregar dados remotos (${resposta.status}).`);
    }

    const payload = await resposta.json();

    if (!payload || !payload.keys) {
        return false;
    }

    return aplicarPayloadSyncRemoto(payload);
}

async function enviarDadosRemotos() {
    const url = obterUrlSyncRemoto();

    if (!url) {
        return false;
    }

    const payload = obterPayloadSyncLocal();
    const payloadSerializado = JSON.stringify(payload.keys);

    if (payloadSerializado === APP_SYNC_STATE.lastSerializedPayload) {
        return false;
    }

    const resposta = await fetch(url, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!resposta.ok) {
        throw new Error(`Falha ao enviar dados remotos (${resposta.status}).`);
    }

    APP_SYNC_STATE.lastSerializedPayload = payloadSerializado;
    return true;
}

async function sincronizarComRemoto(modo = "bidirecional") {
    if (!APP_SYNC_STATE.enabled || APP_SYNC_STATE.isSyncing) {
        return;
    }

    APP_SYNC_STATE.isSyncing = true;

    try {
        if (modo !== "push") {
            const aplicouRemoto = await baixarDadosRemotos();
            if (aplicouRemoto) {
                renderizarPaginaAtual();

                if (window.location.pathname.toLowerCase().includes("saepdetalhes")) {
                    renderizarDetalhesSaep();
                }
            }
        }

        if (modo !== "pull") {
            await enviarDadosRemotos();
        }
    } catch (error) {
        console.error("Erro na sincronização remota:", error);
    } finally {
        APP_SYNC_STATE.isSyncing = false;
    }
}

function agendarSincronizacaoRemota() {
    if (!APP_SYNC_STATE.enabled) {
        return;
    }

    window.clearTimeout(APP_SYNC_STATE.pendingTimeout);
    APP_SYNC_STATE.pendingTimeout = window.setTimeout(() => {
        sincronizarComRemoto("push");
    }, 500);
}

async function inicializarSincronizacaoRemota() {
    if (!APP_SYNC_STATE.enabled || APP_SYNC_STATE.initialized) {
        return;
    }

    APP_SYNC_STATE.initialized = true;

    try {
        const houveDadosRemotos = await baixarDadosRemotos();

        if (!houveDadosRemotos && listarChavesSincronizaveis().some((chave) => localStorage.getItem(chave) !== null)) {
            await enviarDadosRemotos();
        }
    } catch (error) {
        console.error("Erro ao inicializar a sincronização remota:", error);
    }

    window.addEventListener("online", () => sincronizarComRemoto("bidirecional"));
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            sincronizarComRemoto("pull");
        }
    });
    window.setInterval(() => {
        if (!document.hidden) {
            sincronizarComRemoto("pull");
        }
    }, 30000);
}

function formatarDataParaExibir(data) {
    if (!data) {
        return "";
    }

    const partes = data.split("-");
    if (partes.length !== 3) {
        return data;
    }

    const [ano, mes, dia] = partes;
    return `${dia}/${mes}/${ano}`;
}

function abrirModalCadastro() {
    const modal = document.getElementById("modalCadastroTurma");
    const form = document.getElementById("formCadastroTurma");
    const titulo = document.getElementById("modalTitulo");
    const botaoSalvar = document.getElementById("btnSalvarTurma");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        form.reset();
        const indice = document.getElementById("indiceTurmaEdicao");
        if (indice) {
            indice.value = "";
        }
    }

    if (titulo) {
        titulo.textContent = "Cadastrar turma";
    }

    if (botaoSalvar) {
        botaoSalvar.textContent = "Cadastrar";
    }
}

function abrirModalEdicao(index) {
    const turmas = carregarTurmasDoStorage(STORAGE_KEY);
    const turma = turmas[index];

    if (!turma) {
        return;
    }

    document.getElementById("codigoTurma").value = turma.codigoTurma;
    document.getElementById("nomeReduzido").value = turma.nomeReduzido;
    document.getElementById("curso").value = turma.curso;
    document.getElementById("dataInicio").value = turma.dataInicio;
    document.getElementById("dataFim").value = turma.dataFim;
    document.getElementById("instrutor").value = turma.instrutor;
    document.getElementById("indiceTurmaEdicao").value = index;

    const modal = document.getElementById("modalCadastroTurma");
    const titulo = document.getElementById("modalTitulo");
    const botaoSalvar = document.getElementById("btnSalvarTurma");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (titulo) {
        titulo.textContent = "Editar turma";
    }

    if (botaoSalvar) {
        botaoSalvar.textContent = "Salvar alterações";
    }
}

function fecharModalCadastro() {
    const modal = document.getElementById("modalCadastroTurma");
    const form = document.getElementById("formCadastroTurma");

    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }

    if (form) {
        form.reset();
        const indice = document.getElementById("indiceTurmaEdicao");
        if (indice) {
            indice.value = "";
        }
    }

    const titulo = document.getElementById("modalTitulo");
    const botaoSalvar = document.getElementById("btnSalvarTurma");

    if (titulo) {
        titulo.textContent = "Cadastrar turma";
    }

    if (botaoSalvar) {
        botaoSalvar.textContent = "Cadastrar";
    }
}

function salvarTurmasNoStorage(turmas, storageKey = STORAGE_KEY) {
    registrarChaveParaSync(storageKey);
    localStorage.setItem(storageKey, JSON.stringify(turmas));
    agendarSincronizacaoRemota();
}

function carregarTurmasDoStorage(storageKey = STORAGE_KEY) {
    const dados = localStorage.getItem(storageKey);
    if (!dados) {
        return [];
    }

    try {
        return JSON.parse(dados);
    } catch (error) {
        console.error("Erro ao carregar dados salvos:", error);
        return [];
    }
}

function criarBotaoAcao(texto, classe, acao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = classe;
    botao.textContent = texto;
    botao.addEventListener("click", acao);
    return botao;
}

function obterNomeDaPagina() {
    const nomeArquivo = window.location.pathname.split("/").pop() || "";
    const decodificado = decodeURIComponent(nomeArquivo);
    return decodificado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderizarTabelaTurmas(turmas, containerId = "corpotablecadastrodeTurmas", modo = "andamento") {
    const tabela = document.getElementById(containerId);
    if (!tabela) {
        return;
    }

    tabela.innerHTML = "";

    if (!Array.isArray(turmas) || turmas.length === 0) {
        const linhaVazia = document.createElement("tr");
        const celulaVazia = document.createElement("td");
        celulaVazia.colSpan = 8;
        celulaVazia.textContent = modo === "andamento" ? "Nenhuma turma em andamento." : "Nenhuma turma finalizada.";
        linhaVazia.appendChild(celulaVazia);
        tabela.appendChild(linhaVazia);
        return;
    }

    turmas.forEach((turma, index) => {
        const linha = document.createElement("tr");
        const dados = [
            turma.codigoTurma,
            turma.nomeReduzido,
            turma.curso,
            formatarDataParaExibir(turma.dataInicio),
            formatarDataParaExibir(turma.dataFim),
            turma.instrutor
        ];

        dados.forEach((valor) => {
            const celula = document.createElement("td");
            celula.textContent = valor;
            linha.appendChild(celula);
        });

        const celulaAcoes = document.createElement("td");

        if (modo === "andamento") {
            const botaoEditar = criarBotaoAcao("✏️", "btn-edit", () => abrirModalEdicao(index));
            const botaoExcluir = criarBotaoAcao("🗑️", "btn-delete", () => excluirTurma(index, STORAGE_KEY));
            const botaoFinalizar = criarBotaoAcao("✔️", "btn-finish", () => finalizarTurma(index));
            celulaAcoes.appendChild(botaoEditar);
            celulaAcoes.appendChild(botaoExcluir);
            celulaAcoes.appendChild(botaoFinalizar);
        } else {
            const botaoConsulta = criarBotaoAcao("Consultar", "btn-secondary", () => abrirModalConsultaTurmaFinalizada(turma.codigoTurma));
            celulaAcoes.appendChild(botaoConsulta);

            linha.style.cursor = "pointer";
            linha.addEventListener("click", (event) => {
                if (event.target.closest("button")) {
                    return;
                }
                abrirModalConsultaTurmaFinalizada(turma.codigoTurma);
            });
        }

        linha.appendChild(celulaAcoes);
        tabela.appendChild(linha);
    });
}

function excluirTurma(index, storageKey) {
    const turmas = carregarTurmasDoStorage(storageKey);
    if (!turmas[index]) {
        return;
    }

    const confirmacao = window.confirm("Deseja realmente excluir esta turma?");
    if (!confirmacao) {
        return;
    }

    turmas.splice(index, 1);
    salvarTurmasNoStorage(turmas, storageKey);
    renderizarPaginaAtual();
}

function finalizarTurma(index) {
    const turmasAndamento = carregarTurmasDoStorage(STORAGE_KEY);
    const turma = turmasAndamento[index];
    if (!turma) {
        return;
    }

    const confirmacao = window.confirm("Deseja finalizar esta turma e movê-la para a página de finalizadas?");
    if (!confirmacao) {
        return;
    }

    const turmasFinalizadas = carregarTurmasDoStorage(STORAGE_KEY_FINALIZADAS);
    turmasAndamento.splice(index, 1);
    turmasFinalizadas.push(turma);

    salvarTurmasNoStorage(turmasAndamento, STORAGE_KEY);
    salvarTurmasNoStorage(turmasFinalizadas, STORAGE_KEY_FINALIZADAS);
    renderizarPaginaAtual();
    window.location.href = "TurmasFinalizadas.html";
}

function obterTurmaPorCodigo(codigoTurma) {
    const andamento = carregarTurmasDoStorage(STORAGE_KEY);
    const finalizadas = carregarTurmasDoStorage(STORAGE_KEY_FINALIZADAS);
    return [...andamento, ...finalizadas].find((item) => item.codigoTurma === codigoTurma) || null;
}

function carregarDadosSaepDaTurmaConsulta(codigoTurma) {
    const turma = obterTurmaPorCodigo(codigoTurma);
    const datas = (carregarTurmasDoStorage("saepDatas") || []).find((item) => item.codigoTurma === codigoTurma) || {};
    const acoes = (carregarTurmasDoStorage("saepAcoes") || []).filter((item) => item.codigoTurma === codigoTurma);
    const avaliacoesObjetivo = (carregarTurmasDoStorage("saepAvaliacoesObjetivo") || []).filter((item) => item.codigoTurma === codigoTurma);
    const avaliacoesPratico = (carregarTurmasDoStorage("saepAvaliacoesPratico") || []).filter((item) => item.codigoTurma === codigoTurma);
    const plataformas = obterDadosPlataformasTurma(codigoTurma);

    return { turma, datas, acoes, avaliacoesObjetivo, avaliacoesPratico, plataformas };
}

function abrirModalConsultaTurmaFinalizada(codigoTurma) {
    const modal = document.getElementById("modalConsultaTurmaFinalizada");
    const conteudo = document.getElementById("conteudoConsultaTurmaFinalizada");
    if (!modal || !conteudo) {
        return;
    }

    const dados = carregarDadosSaepDaTurmaConsulta(codigoTurma);
    if (!dados.turma) {
        alert("Turma não encontrada para consulta.");
        return;
    }

    const indicadores = calcularIndicadoresSaep(dados);
    const etapas = dados.plataformas?.etapas || [];
    const informativos = dados.plataformas?.informativos || [];

    conteudo.innerHTML = `
        <div class="consulta-finalizada__badge">Turma Finalizada - Modo de Consulta</div>
        <div class="saep-grid saep-grid--2">
            <div class="saep-card">
                <div class="saep-card__header"><h3>Dados da Turma</h3></div>
                <div class="form-grid">
                    <label>Código da Turma<input type="text" value="${dados.turma.codigoTurma || ""}" readonly disabled></label>
                    <label>Curso<input type="text" value="${dados.turma.curso || ""}" readonly disabled></label>
                    <label>Instrutor<input type="text" value="${dados.turma.instrutor || ""}" readonly disabled></label>
                    <label>Período<input type="text" value="${formatarDataParaExibirSaep(dados.turma.dataInicio)} a ${formatarDataParaExibirSaep(dados.turma.dataFim)}" readonly disabled></label>
                </div>
            </div>
            <div class="saep-card">
                <div class="saep-card__header"><h3>Resumo Pedagógico</h3></div>
                <div class="saep-metric-grid">
                    <div class="saep-metric-card"><span>Média da turma</span><strong>${indicadores.mediaTurma !== "-" ? indicadores.mediaTurma : "Sem avaliações"}</strong></div>
                    <div class="saep-metric-card"><span>Meta</span><strong>${indicadores.meta}</strong></div>
                    <div class="saep-metric-card"><span>Alunos abaixo da meta</span><strong>${indicadores.alunosAbaixoMeta}</strong></div>
                    <div class="saep-metric-card"><span>Ações + etapas</span><strong>${dados.acoes.length + etapas.length}</strong></div>
                </div>
            </div>
        </div>

        <div class="saep-grid saep-grid--2">
            <div class="saep-card">
                <div class="saep-card__header"><h3>Datas SAEP</h3></div>
                <div class="form-grid">
                    <label>Prova Objetiva<input type="text" value="${formatarDataParaExibirSaep(dados.datas.saepObjetivo || "")}" readonly disabled></label>
                    <label>Prova Prática<input type="text" value="${formatarDataParaExibirSaep(dados.datas.saepPratico || "")}" readonly disabled></label>
                </div>
            </div>
            <div class="saep-card">
                <div class="saep-card__header"><h3>Visualização de Gráficos</h3></div>
                <div class="saep-empty-state">Gráficos e painéis mantidos em modo somente leitura.</div>
            </div>
        </div>

        <div class="saep-card">
            <div class="saep-card__header"><h3>Plano de Ação (Consulta)</h3></div>
            <div class="table-scroll">
                <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                    <thead><tr><th>Título</th><th>Data</th><th>Responsável</th><th>Status</th></tr></thead>
                    <tbody>
                        ${dados.acoes.length === 0
        ? '<tr><td colspan="4">Nenhuma ação registrada.</td></tr>'
        : dados.acoes.map((item) => `<tr><td>${item.titulo}</td><td>${formatarDataParaExibirSaep(item.data)}</td><td>${item.responsavel}</td><td>${item.status}</td></tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="saep-card">
            <div class="saep-card__header"><h3>Etapas de Acesso (Consulta)</h3></div>
            <div class="table-scroll">
                <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                    <thead><tr><th>Início</th><th>Fim</th><th>Ação</th><th>Status</th><th>Observações</th></tr></thead>
                    <tbody>
                        ${etapas.length === 0
        ? '<tr><td colspan="5">Nenhuma etapa registrada.</td></tr>'
        : etapas.map((item) => `
                            <tr>
                                <td>${formatarDataParaExibirSaep(item.dataInicio)}</td>
                                <td>${formatarDataParaExibirSaep(item.dataFim)}</td>
                                <td>${item.acao || "-"}</td>
                                <td>${item.status || "-"}</td>
                                <td>${item.observacoes || "-"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="saep-grid saep-grid--2">
            <div class="saep-card">
                <div class="saep-card__header"><h3>Avaliações Objetivas (Consulta)</h3></div>
                <div class="table-scroll">
                    <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                        <thead><tr><th>Data</th><th>Nota Média</th><th>Observações</th></tr></thead>
                        <tbody>
                            ${dados.avaliacoesObjetivo.length === 0
        ? '<tr><td colspan="3">Nenhuma avaliação objetiva registrada.</td></tr>'
        : dados.avaliacoesObjetivo.map((item) => `
                                <tr>
                                    <td>${formatarDataParaExibirSaep(item.data)}</td>
                                    <td>${item.notaMedia || "-"}</td>
                                    <td>${item.observacoes || "-"}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="saep-card">
                <div class="saep-card__header"><h3>Avaliações Práticas (Consulta)</h3></div>
                <div class="table-scroll">
                    <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                        <thead><tr><th>Data</th><th>Nota Média</th><th>Observações</th></tr></thead>
                        <tbody>
                            ${dados.avaliacoesPratico.length === 0
        ? '<tr><td colspan="3">Nenhuma avaliação prática registrada.</td></tr>'
        : dados.avaliacoesPratico.map((item) => `
                                <tr>
                                    <td>${formatarDataParaExibirSaep(item.data)}</td>
                                    <td>${item.notaMedia || "-"}</td>
                                    <td>${item.observacoes || "-"}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="saep-card">
            <div class="saep-card__header"><h3>Mural e Informativos (Consulta)</h3></div>
            <div class="table-scroll">
                <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                    <thead><tr><th>Data</th><th>Informativo</th></tr></thead>
                    <tbody>
                        ${informativos.length === 0
        ? '<tr><td colspan="2">Nenhum informativo registrado.</td></tr>'
        : informativos.slice().reverse().map((item) => `
                            <tr>
                                <td>${item.criadoEm ? new Date(item.criadoEm).toLocaleString("pt-BR") : "-"}</td>
                                <td>${item.texto || "-"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
}

function fecharModalConsultaTurmaFinalizada() {
    const modal = document.getElementById("modalConsultaTurmaFinalizada");
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function renderizarPaginaAtual() {
    const pagina = obterNomeDaPagina();

    if (pagina === "index.html" || pagina === "index" || pagina === "") {
        renderizarTabelaTurmas(carregarTurmasDoStorage(STORAGE_KEY), "corpotablecadastrodeTurmas", "andamento");
        return;
    }

    if (pagina.includes("turmasfinalizadas")) {
        renderizarTabelaTurmas(carregarTurmasDoStorage(STORAGE_KEY_FINALIZADAS), "corpotablecadastrodeTurmas", "finalizadas");
        return;
    }

    if (pagina.includes("ocorrencia") && pagina.includes("turma")) {
        renderizarDetalhesTurmaNaPagina();
        return;
    }

    if (pagina.includes("ocorrencia") || pagina.includes("ocorrencias")) {
        renderizarTurmasEmOcorrencias();
        return;
    }

    if (pagina.includes("seeduc")) {
        renderizarTabelaSeeduc();
        return;
    }

    if (pagina.includes("saep")) {
        renderizarTurmasSaep();
    }
}

function cadastrarTurmas(event) {
    event.preventDefault();

    const turma = {
        codigoTurma: document.getElementById("codigoTurma").value.trim(),
        nomeReduzido: document.getElementById("nomeReduzido").value.trim(),
        curso: document.getElementById("curso").value.trim(),
        dataInicio: document.getElementById("dataInicio").value,
        dataFim: document.getElementById("dataFim").value,
        instrutor: document.getElementById("instrutor").value.trim()
    };

    if (!turma.codigoTurma || !turma.nomeReduzido || !turma.curso || !turma.dataInicio || !turma.dataFim || !turma.instrutor) {
        alert("Preencha todos os campos para cadastrar a turma.");
        return;
    }

    const turmasSalvas = carregarTurmasDoStorage(STORAGE_KEY);
    const indiceEdicao = document.getElementById("indiceTurmaEdicao").value;

    if (indiceEdicao !== "") {
        turmasSalvas[parseInt(indiceEdicao, 10)] = turma;
    } else {
        turmasSalvas.push(turma);
    }

    salvarTurmasNoStorage(turmasSalvas, STORAGE_KEY);
    renderizarPaginaAtual();
    fecharModalCadastro();
}

function obterChaveAlunosTurma(codigoTurma) {
    return `${STORAGE_KEY_ALUNOS}_${codigoTurma}`;
}

function obterChaveOcorrenciasTurma(codigoTurma) {
    return `${STORAGE_KEY_OCORRENCIAS}_${codigoTurma}`;
}

function carregarAlunosDaTurma(codigoTurma) {
    const alunos = carregarTurmasDoStorage(obterChaveAlunosTurma(codigoTurma));
    return Array.isArray(alunos) ? alunos.filter(Boolean) : [];
}

function salvarAlunosDaTurma(codigoTurma, alunos) {
    salvarTurmasNoStorage(alunos, obterChaveAlunosTurma(codigoTurma));
}

function carregarOcorrenciasDaTurma(codigoTurma) {
    const ocorrencias = carregarTurmasDoStorage(obterChaveOcorrenciasTurma(codigoTurma));
    if (!Array.isArray(ocorrencias)) {
        return [];
    }

    return ocorrencias.map((item) => {
        if (typeof item === "string") {
            return {
                aluno: item,
                tipo: "Pedagógica",
                descricao: item,
                textoAssistido: ""
            };
        }

        return {
            aluno: item?.aluno || "",
            tipo: item?.tipo || "Pedagógica",
            descricao: item?.descricao || "",
            textoAssistido: item?.textoAssistido || ""
        };
    }).filter((item) => item.aluno);
}

function salvarOcorrenciasDaTurma(codigoTurma, ocorrencias) {
    salvarTurmasNoStorage(ocorrencias, obterChaveOcorrenciasTurma(codigoTurma));
}

function abrirModalCadastroSeeduc() {
    const modal = document.getElementById("modalCadastroSeeduc");
    const form = document.getElementById("formCadastroSeeduc");
    const titulo = document.getElementById("modalTituloSeeduc");
    const indice = document.getElementById("indiceTurmaSeeducEdicao");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        form.reset();
    }

    if (titulo) {
        titulo.textContent = "Cadastrar turma SEEDUC";
    }

    if (indice) {
        indice.value = "";
    }
}

function abrirModalEdicaoSeeduc(index) {
    const turmasSeeduc = carregarTurmasDoStorage("seeducTurmas") || [];
    const turma = turmasSeeduc[index];

    if (!turma) {
        return;
    }

    document.getElementById("municipioSeeduc").value = turma.municipio || "";
    document.getElementById("escolaSeeduc").value = turma.escola || "";
    document.getElementById("codigoTurmaSeeduc").value = turma.codigoTurma || "";
    document.getElementById("instrutorSeeduc").value = turma.instrutor || "";
    document.getElementById("dataInicioSeeduc").value = turma.dataInicio || "";
    document.getElementById("dataFimSeeduc").value = turma.dataFim || "";
    document.getElementById("indiceTurmaSeeducEdicao").value = index;

    const modal = document.getElementById("modalCadastroSeeduc");
    const titulo = document.getElementById("modalTituloSeeduc");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (titulo) {
        titulo.textContent = "Editar turma SEEDUC";
    }
}

function fecharModalCadastroSeeduc() {
    const modal = document.getElementById("modalCadastroSeeduc");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
}

function salvarTurmaSeeduc(event) {
    event.preventDefault();

    const turma = {
        municipio: document.getElementById("municipioSeeduc").value.trim(),
        escola: document.getElementById("escolaSeeduc").value.trim(),
        codigoTurma: document.getElementById("codigoTurmaSeeduc").value.trim(),
        instrutor: document.getElementById("instrutorSeeduc").value.trim(),
        dataInicio: document.getElementById("dataInicioSeeduc").value,
        dataFim: document.getElementById("dataFimSeeduc").value
    };

    if (!turma.municipio || !turma.escola || !turma.codigoTurma || !turma.instrutor || !turma.dataInicio || !turma.dataFim) {
        alert("Preencha todos os campos para cadastrar a turma SEEDUC.");
        return;
    }

    const turmasSeeduc = carregarTurmasDoStorage("seeducTurmas") || [];
    const indiceEdicao = document.getElementById("indiceTurmaSeeducEdicao").value;

    if (indiceEdicao !== "") {
        turmasSeeduc[parseInt(indiceEdicao, 10)] = turma;
    } else {
        turmasSeeduc.push(turma);
    }

    salvarTurmasNoStorage(turmasSeeduc, "seeducTurmas");
    fecharModalCadastroSeeduc();
    renderizarTabelaSeeduc();
}

function excluirTurmaSeeduc(index) {
    const turmasSeeduc = carregarTurmasDoStorage("seeducTurmas") || [];
    const turma = turmasSeeduc[index];

    if (!turma) {
        return;
    }

    const confirmacao = window.confirm(`Deseja excluir a turma ${turma.codigoTurma || "selecionada"}?`);
    if (!confirmacao) {
        return;
    }

    turmasSeeduc.splice(index, 1);
    salvarTurmasNoStorage(turmasSeeduc, "seeducTurmas");
    renderizarTabelaSeeduc();
}

function alternarVisibilidadeTabelaSeeduc(estaVisivel) {
    const tabelaBase = document.getElementById("tabelaSeeducBase");
    if (tabelaBase) {
        tabelaBase.style.display = estaVisivel ? "table" : "none";
    }
}

function mostrarAbaSeeduc(aba) {
    const container = document.getElementById("conteudoSeeduc");
    const botoes = document.querySelectorAll(".seeduc-submenu__item");

    if (!container) {
        return;
    }

    botoes.forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.aba === aba);
    });

    if (aba === "turmas") {
        alternarVisibilidadeTabelaSeeduc(true);
        renderizarTabelaSeeduc();
        return;
    }

    if (aba === "relatorios") {
        alternarVisibilidadeTabelaSeeduc(false);
        mostrarRelatorioSeeduc("julho");
    }
}

function mostrarRelatorioSeeduc(mes) {
    const container = document.getElementById("conteudoSeeduc");
    const botoes = document.querySelectorAll(".seeduc-submenu__item");
    alternarVisibilidadeTabelaSeeduc(false);

    if (!container) {
        return;
    }

    botoes.forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.aba === "relatorios");
    });

    const turmas = carregarTurmasDoStorage("seeducTurmas") || [];
    const registros = carregarTurmasDoStorage("seeducRegistros") || [];
    const colunasExtras = mes === "outubro"
        ? ["Relatório", "SGE", "Projeto", "Envio"]
        : ["Relatório", "SGE", "Envio"];

    const linhas = turmas.map((turma, index) => {
        const registro = registros[index] || {};
        const estadoMes = registro[mes] || {};

        return `
            <tr>
                <td>${turma.municipio || "-"}</td>
                <td>${turma.escola || "-"}</td>
                <td>${turma.codigoTurma || "-"}</td>
                <td>${turma.instrutor || "-"}</td>
                <td class="flag-cell"><input type="checkbox" data-index="${index}" data-campo="relatorio" data-mes="${mes}" ${estadoMes.relatorio ? "checked" : ""}></td>
                <td class="flag-cell"><input type="checkbox" data-index="${index}" data-campo="sge" data-mes="${mes}" ${estadoMes.sge ? "checked" : ""}></td>
                ${mes === "outubro" ? `<td class="flag-cell"><input type="checkbox" data-index="${index}" data-campo="projeto" data-mes="${mes}" ${estadoMes.projeto ? "checked" : ""}></td>` : ""}
                <td class="flag-cell"><input type="checkbox" data-index="${index}" data-campo="envio" data-mes="${mes}" ${estadoMes.envio ? "checked" : ""}></td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <div class="seeduc-submenu seeduc-submenu-months">
            <button type="button" class="seeduc-submenu__item ${mes === "julho" ? "active" : ""}" onclick="mostrarRelatorioSeeduc('julho')">Julho</button>
            <button type="button" class="seeduc-submenu__item ${mes === "agosto" ? "active" : ""}" onclick="mostrarRelatorioSeeduc('agosto')">Agosto</button>
            <button type="button" class="seeduc-submenu__item ${mes === "setembro" ? "active" : ""}" onclick="mostrarRelatorioSeeduc('setembro')">Setembro</button>
            <button type="button" class="seeduc-submenu__item ${mes === "outubro" ? "active" : ""}" onclick="mostrarRelatorioSeeduc('outubro')">Outubro</button>
        </div>
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Município</th>
                        <th>Escola</th>
                        <th>Código da Turma</th>
                        <th>Instrutor</th>
                        ${colunasExtras.map((coluna) => `<th>${coluna}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `;

    container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
            const index = Number(event.target.dataset.index);
            const campo = event.target.dataset.campo;
            const mesSelecionado = event.target.dataset.mes;
            const dados = carregarTurmasDoStorage("seeducRegistros") || [];
            const registro = dados[index] || {};
            const estadoMes = registro[mesSelecionado] || {};
            estadoMes[campo] = event.target.checked;
            registro[mesSelecionado] = estadoMes;
            dados[index] = registro;
            salvarTurmasNoStorage(dados, "seeducRegistros");
        });
    });
}

function renderizarTabelaSeeduc() {
    const tabela = document.getElementById("tabelaSeeduc");
    alternarVisibilidadeTabelaSeeduc(true);
    if (!tabela) {
        return;
    }

    const turmas = carregarTurmasDoStorage("seeducTurmas") || [];
    const container = document.getElementById("conteudoSeeduc");
    tabela.innerHTML = "";

    if (container) {
        container.innerHTML = "";
    }

    if (turmas.length === 0) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.colSpan = 8;
        celula.textContent = "Nenhuma turma cadastrada.";
        linha.appendChild(celula);
        tabela.appendChild(linha);
        return;
    }

    const dadosSeeduc = carregarTurmasDoStorage("seeducRegistros") || [];

    turmas.forEach((turma, index) => {
        const registro = dadosSeeduc[index] || {};
        const linha = document.createElement("tr");
        linha.innerHTML = `
            <td>${turma.municipio || "-"}</td>
            <td>${turma.escola || "-"}</td>
            <td>${turma.codigoTurma || "-"}</td>
            <td>${formatarDataParaExibir(turma.dataInicio)}</td>
            <td>${formatarDataParaExibir(turma.dataFim)}</td>
            <td>${turma.instrutor || "-"}</td>
            <td class="flag-cell"><input type="checkbox" ${registro.sge ? "checked" : ""} data-index="${index}"></td>
            <td class="obs-cell">
                <span>${registro.observacao || "Sem observação"}</span>
                <button type="button" class="obs-btn" data-index="${index}" title="Editar observação">✏️</button>
            </td>
            <td class="actions-cell">
                <button type="button" class="btn-edit" data-index="${index}" onclick="abrirModalEdicaoSeeduc(${index})">✏️</button>
                <button type="button" class="btn-delete" data-index="${index}" onclick="excluirTurmaSeeduc(${index})">🗑️</button>
            </td>
        `;
        tabela.appendChild(linha);
    });

    tabela.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
            const index = Number(event.target.dataset.index);
            const dados = carregarTurmasDoStorage("seeducRegistros") || [];
            dados[index] = { ...(dados[index] || {}), sge: event.target.checked };
            salvarTurmasNoStorage(dados, "seeducRegistros");
        });
    });

    tabela.querySelectorAll(".obs-btn").forEach((botao) => {
        botao.addEventListener("click", (event) => {
            const index = Number(event.currentTarget.dataset.index);
            const dados = carregarTurmasDoStorage("seeducRegistros") || [];
            const atual = dados[index] || {};
            const novaObservacao = window.prompt("Digite a observação:", atual.observacao || "");

            if (novaObservacao === null) {
                return;
            }

            dados[index] = { ...atual, observacao: novaObservacao };
            salvarTurmasNoStorage(dados, "seeducRegistros");
            renderizarTabelaSeeduc();
        });
    });
}

function renderizarTurmasEmOcorrencias() {
    const tabela = document.getElementById("tabelaTurmasOcorrencia");
    if (!tabela) {
        return;
    }

    const turmas = carregarTurmasDoStorage(STORAGE_KEY);
    tabela.innerHTML = "";

    if (turmas.length === 0) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.colSpan = 3;
        celula.textContent = "Nenhuma turma cadastrada.";
        linha.appendChild(celula);
        tabela.appendChild(linha);
        return;
    }

    turmas.forEach((turma) => {
        const linha = document.createElement("tr");
        linha.innerHTML = `
            <td><button class="link-button" data-turma="${turma.codigoTurma}">${turma.codigoTurma}</button></td>
            <td>${turma.curso}</td>
            <td>${turma.instrutor}</td>
        `;
        tabela.appendChild(linha);
    });

    tabela.querySelectorAll(".link-button").forEach((botao) => {
        botao.addEventListener("click", () => {
            window.location.href = `OcorrenciaTurma.html?turma=${encodeURIComponent(botao.dataset.turma)}`;
        });
    });
}

function abrirModalCadastroSaep(codigoTurma = "") {
    const modal = document.getElementById("modalCadastroSaep");
    const codigoInput = document.getElementById("codigoTurmaSaepEdicao");
    const form = document.getElementById("formCadastroSaep");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (codigoInput) {
        codigoInput.value = codigoTurma;
    }

    if (form) {
        form.reset();
    }

    const dados = carregarTurmasDoStorage("saepDatas") || [];
    const registro = dados.find((item) => item.codigoTurma === codigoTurma);

    if (registro) {
        const objetivo = document.getElementById("dataSaepObjetivo");
        const pratico = document.getElementById("dataSaepPratico");

        if (objetivo) {
            objetivo.value = registro.saepObjetivo || "";
        }

        if (pratico) {
            pratico.value = registro.saepPratico || "";
        }
    }
}

function fecharModalCadastroSaep() {
    const modal = document.getElementById("modalCadastroSaep");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
}

function salvarDatasSaep(event) {
    event.preventDefault();

    const codigoTurma = document.getElementById("codigoTurmaSaepEdicao").value.trim();
    const saepObjetivo = document.getElementById("dataSaepObjetivo").value;
    const saepPratico = document.getElementById("dataSaepPratico").value;

    if (!codigoTurma) {
        alert("Selecione uma turma antes de salvar.");
        return;
    }

    const dados = carregarTurmasDoStorage("saepDatas") || [];
    const indice = dados.findIndex((item) => item.codigoTurma === codigoTurma);
    const registro = { codigoTurma, saepObjetivo, saepPratico };

    if (indice >= 0) {
        dados[indice] = registro;
    } else {
        dados.push(registro);
    }

    salvarTurmasNoStorage(dados, "saepDatas");
    fecharModalCadastroSaep();
    renderizarTurmasSaep();
}

function abrirPaginaDetalhesSaep(codigoTurma) {
    window.location.href = `SAEPDetalhes.html?turma=${encodeURIComponent(codigoTurma)}`;
}

function carregarDadosSaepDaTurma(codigoTurma) {
    const turma = carregarTurmasDoStorage(STORAGE_KEY).find((item) => item.codigoTurma === codigoTurma);
    const datas = (carregarTurmasDoStorage("saepDatas") || []).find((item) => item.codigoTurma === codigoTurma) || {};
    const acoes = (carregarTurmasDoStorage("saepAcoes") || []).filter((item) => item.codigoTurma === codigoTurma);
    const avaliacoesObjetivo = (carregarTurmasDoStorage("saepAvaliacoesObjetivo") || []).filter((item) => item.codigoTurma === codigoTurma);
    const avaliacoesPratico = (carregarTurmasDoStorage("saepAvaliacoesPratico") || []).filter((item) => item.codigoTurma === codigoTurma);

    return { turma, datas, acoes, avaliacoesObjetivo, avaliacoesPratico };
}

function carregarDadosPlataformasSaep() {
    const dados = carregarTurmasDoStorage(SAEP_PLATAFORMAS_STORAGE_KEY);

    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return {};
    }

    return dados;
}

function salvarDadosPlataformasSaep(dados) {
    salvarTurmasNoStorage(dados, SAEP_PLATAFORMAS_STORAGE_KEY);
}

function obterDadosPlataformasTurma(codigoTurma) {
    const dados = carregarDadosPlataformasSaep();
    const turma = dados[codigoTurma] || {};

    return {
        informativos: Array.isArray(turma.informativos) ? turma.informativos : [],
        datasSaep: Array.isArray(turma.datasSaep) ? turma.datasSaep : [],
        etapas: Array.isArray(turma.etapas) ? turma.etapas : []
    };
}

function atualizarDadosPlataformasTurma(codigoTurma, atualizador) {
    const dados = carregarDadosPlataformasSaep();
    const atual = obterDadosPlataformasTurma(codigoTurma);
    dados[codigoTurma] = atualizador({
        informativos: [...atual.informativos],
        datasSaep: [...atual.datasSaep],
        etapas: [...atual.etapas]
    });
    salvarDadosPlataformasSaep(dados);
    return dados[codigoTurma];
}

function abrirModalPlataforma(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
}

function fecharModalPlataforma(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function atualizarCamposTipoProvaPlataforma() {
    const tipo = document.getElementById("tipoProvaSaepPlataforma")?.value;
    const grupoObjetiva = document.getElementById("grupoDataObjetivaPlataforma");
    const grupoPraticaInicio = document.getElementById("grupoDataPraticaInicioPlataforma");
    const grupoPraticaFim = document.getElementById("grupoDataPraticaFimPlataforma");
    const dataObjetiva = document.getElementById("dataObjetivaPlataforma");
    const dataPraticaInicio = document.getElementById("dataPraticaInicioPlataforma");
    const dataPraticaFim = document.getElementById("dataPraticaFimPlataforma");

    if (!grupoObjetiva || !grupoPraticaInicio || !grupoPraticaFim || !dataObjetiva || !dataPraticaInicio || !dataPraticaFim) {
        return;
    }

    const isObjetiva = tipo === "objetiva";
    grupoObjetiva.style.display = isObjetiva ? "flex" : "none";
    grupoPraticaInicio.style.display = isObjetiva ? "none" : "flex";
    grupoPraticaFim.style.display = isObjetiva ? "none" : "flex";

    dataObjetiva.required = isObjetiva;
    dataPraticaInicio.required = !isObjetiva;
    dataPraticaFim.required = !isObjetiva;
}

function renderizarMuralPlataformas(codigoTurma) {
    const container = document.getElementById("saepMuralDestaque");
    if (!container) {
        return;
    }

    const { informativos } = obterDadosPlataformasTurma(codigoTurma);

    if (informativos.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Nenhum informativo cadastrado para esta turma.</div>';
        return;
    }

    const [maisRecente] = informativos.slice(-1);

    container.innerHTML = `
        <div class="saep-mural-highlight">
            <strong>Último informativo</strong>
            <p>${maisRecente.texto}</p>
            <span>${new Date(maisRecente.criadoEm).toLocaleString("pt-BR")}</span>
        </div>
        <ul class="saep-list saep-mural-list">
            ${informativos.slice().reverse().map((item) => `
                <li>
                    <div class="saep-mural-item-head">
                        <strong>${new Date(item.criadoEm).toLocaleDateString("pt-BR")}</strong>
                        <button type="button" class="btn-delete saep-inline-danger" data-excluir-informativo="${item.id}" title="Excluir informativo">🗑️</button>
                    </div>
                    <p>${item.texto}</p>
                </li>
            `).join("")}
        </ul>
    `;

    container.querySelectorAll("[data-excluir-informativo]").forEach((botao) => {
        botao.onclick = () => {
            const informativoId = botao.getAttribute("data-excluir-informativo");
            const confirmar = window.confirm("Deseja realmente excluir este informativo?");
            if (!confirmar) {
                return;
            }

            atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => ({
                ...dadosTurma,
                informativos: dadosTurma.informativos.filter((item) => item.id !== informativoId)
            }));

            renderizarMuralPlataformas(codigoTurma);
        };
    });
}

function renderizarDatasSaepPlataforma(codigoTurma) {
    const container = document.getElementById("saepListaDatasPlataforma");
    if (!container) {
        return;
    }

    const { datasSaep } = obterDadosPlataformasTurma(codigoTurma);

    if (datasSaep.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Nenhuma data de SAEP cadastrada nesta aba.</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Tipo</th>
                        <th>Código da Turma</th>
                        <th>Instrutor</th>
                        <th>Data(s)</th>
                    </tr>
                </thead>
                <tbody>
                    ${datasSaep.slice().reverse().map((item) => `
                        <tr>
                            <td>${item.tipo === "objetiva" ? "Prova Objetiva" : "Prova Prática"}</td>
                            <td>${item.codigoTurma}</td>
                            <td>${item.instrutor}</td>
                            <td>
                                ${item.tipo === "objetiva"
        ? formatarDataParaExibirSaep(item.data)
        : `${formatarDataParaExibirSaep(item.dataInicio)} a ${formatarDataParaExibirSaep(item.dataFim)}`}
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderizarTabelaEtapasAcesso(codigoTurma) {
    const container = document.getElementById("saepTabelaEtapasAcesso");
    if (!container) {
        return;
    }

    const { etapas } = obterDadosPlataformasTurma(codigoTurma);

    container.innerHTML = `
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Início</th>
                        <th>Fim</th>
                        <th>Ação</th>
                        <th>Status</th>
                        <th>Ações/Edição</th>
                        <th>Observações</th>
                    </tr>
                </thead>
                <tbody>
                    ${etapas.length === 0
        ? '<tr><td colspan="6">Nenhuma etapa cadastrada.</td></tr>'
        : etapas.map((item) => `
                        <tr>
                            <td>${formatarDataParaExibirSaep(item.dataInicio)}</td>
                            <td>${formatarDataParaExibirSaep(item.dataFim)}</td>
                            <td>${item.acao}</td>
                            <td>${item.status}</td>
                            <td>
                                <button type="button" class="btn-secondary saep-inline-btn" data-editar-etapa="${item.id}">Editar</button>
                                <button type="button" class="btn-delete saep-inline-danger" data-excluir-etapa="${item.id}" title="Excluir etapa">🗑️</button>
                            </td>
                            <td>
                                <button type="button" class="saep-icon-btn" data-observacao-etapa="${item.id}" title="Editar observações">
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                        <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 000-1.42l-2.5-2.5a1.003 1.003 0 00-1.42 0L14.13 5.95l3.75 3.75 2.83-2.49z"/>
                                    </svg>
                                </button>
                                <span class="saep-observacao-preview">${item.observacoes ? item.observacoes : "Sem observações"}</span>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    container.querySelectorAll("[data-editar-etapa]").forEach((botao) => {
        botao.onclick = () => {
            const etapaId = botao.getAttribute("data-editar-etapa");
            const etapa = etapas.find((item) => item.id === etapaId);
            if (!etapa) {
                return;
            }

            document.getElementById("etapaAcessoId").value = etapa.id;
            document.getElementById("etapaDataInicio").value = etapa.dataInicio;
            document.getElementById("etapaDataFim").value = etapa.dataFim;
            document.getElementById("etapaAcao").value = etapa.acao;
            document.getElementById("etapaStatus").value = etapa.status;
            document.getElementById("tituloModalEtapasAcesso").textContent = "Editar Etapa de Acesso";
            abrirModalPlataforma("modalEtapasAcesso");
        };
    });

    container.querySelectorAll("[data-observacao-etapa]").forEach((botao) => {
        botao.onclick = () => {
            const etapaId = botao.getAttribute("data-observacao-etapa");
            const etapa = etapas.find((item) => item.id === etapaId);
            if (!etapa) {
                return;
            }

            const texto = window.prompt("Digite as observações desta etapa:", etapa.observacoes || "");
            if (texto === null) {
                return;
            }

            atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => ({
                ...dadosTurma,
                etapas: dadosTurma.etapas.map((item) => item.id === etapaId ? { ...item, observacoes: texto.trim() } : item)
            }));

            renderizarTabelaEtapasAcesso(codigoTurma);
        };
    });

    container.querySelectorAll("[data-excluir-etapa]").forEach((botao) => {
        botao.onclick = () => {
            const etapaId = botao.getAttribute("data-excluir-etapa");
            const confirmar = window.confirm("Deseja realmente excluir esta etapa?");
            if (!confirmar) {
                return;
            }

            atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => ({
                ...dadosTurma,
                etapas: dadosTurma.etapas.filter((item) => item.id !== etapaId)
            }));

            renderizarTabelaEtapasAcesso(codigoTurma);
        };
    });
}

function configurarPlataformasSaep(codigoTurma, instrutorPadrao) {
    const botaoInformativo = document.getElementById("btnCadastrarInformativos");
    const botaoDatasSaep = document.getElementById("btnCadastrarDatasSaepPlataforma");
    const botaoEtapas = document.getElementById("btnCadastrarEtapasAcesso");
    const formInformativo = document.getElementById("formInformativoPlataforma");
    const formDatas = document.getElementById("formDatasSaepPlataforma");
    const formEtapas = document.getElementById("formEtapasAcesso");
    const selectTipoProva = document.getElementById("tipoProvaSaepPlataforma");
    const inputCodigoTurma = document.getElementById("codigoTurmaPlataforma");
    const inputInstrutor = document.getElementById("instrutorPlataforma");
    const modalInformativo = document.getElementById("modalInformativoPlataforma");
    const modalDatas = document.getElementById("modalDatasSaepPlataforma");
    const modalEtapas = document.getElementById("modalEtapasAcesso");

    if (!botaoInformativo || !botaoDatasSaep || !botaoEtapas || !formInformativo || !formDatas || !formEtapas || !selectTipoProva || !inputCodigoTurma || !inputInstrutor || !modalInformativo || !modalDatas || !modalEtapas) {
        return;
    }

    renderizarMuralPlataformas(codigoTurma);
    renderizarDatasSaepPlataforma(codigoTurma);
    renderizarTabelaEtapasAcesso(codigoTurma);

    botaoInformativo.onclick = () => {
        formInformativo.reset();
        abrirModalPlataforma("modalInformativoPlataforma");
    };

    document.getElementById("btnCancelarInformativoPlataforma").onclick = () => fecharModalPlataforma("modalInformativoPlataforma");

    formInformativo.onsubmit = (event) => {
        event.preventDefault();
        const texto = document.getElementById("informativoPlataformaTexto").value.trim();

        if (!texto) {
            alert("Preencha o informativo.");
            return;
        }

        atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => ({
            ...dadosTurma,
            informativos: [...dadosTurma.informativos, { id: `${Date.now()}`, texto, criadoEm: new Date().toISOString() }]
        }));

        fecharModalPlataforma("modalInformativoPlataforma");
        renderizarMuralPlataformas(codigoTurma);
    };

    botaoDatasSaep.onclick = () => {
        formDatas.reset();
        inputCodigoTurma.value = codigoTurma;
        inputInstrutor.value = instrutorPadrao || "";
        selectTipoProva.value = "objetiva";
        atualizarCamposTipoProvaPlataforma();
        abrirModalPlataforma("modalDatasSaepPlataforma");
    };

    document.getElementById("btnCancelarDatasSaepPlataforma").onclick = () => fecharModalPlataforma("modalDatasSaepPlataforma");

    selectTipoProva.onchange = atualizarCamposTipoProvaPlataforma;

    formDatas.onsubmit = (event) => {
        event.preventDefault();

        const tipo = selectTipoProva.value;
        const codigoTurmaInformado = inputCodigoTurma.value.trim();
        const instrutor = inputInstrutor.value.trim();
        const dataObjetiva = document.getElementById("dataObjetivaPlataforma").value;
        const dataPraticaInicio = document.getElementById("dataPraticaInicioPlataforma").value;
        const dataPraticaFim = document.getElementById("dataPraticaFimPlataforma").value;

        if (!codigoTurmaInformado || !instrutor) {
            alert("Informe código da turma e instrutor.");
            return;
        }

        if (tipo === "objetiva" && !dataObjetiva) {
            alert("Informe a data da prova objetiva.");
            return;
        }

        if (tipo === "pratica" && (!dataPraticaInicio || !dataPraticaFim)) {
            alert("Informe início e término da prova prática.");
            return;
        }

        atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => ({
            ...dadosTurma,
            datasSaep: [...dadosTurma.datasSaep, {
                id: `${Date.now()}`,
                tipo,
                codigoTurma: codigoTurmaInformado,
                instrutor,
                data: tipo === "objetiva" ? dataObjetiva : "",
                dataInicio: tipo === "pratica" ? dataPraticaInicio : "",
                dataFim: tipo === "pratica" ? dataPraticaFim : "",
                criadoEm: new Date().toISOString()
            }]
        }));

        fecharModalPlataforma("modalDatasSaepPlataforma");
        renderizarDatasSaepPlataforma(codigoTurma);
    };

    botaoEtapas.onclick = () => {
        formEtapas.reset();
        document.getElementById("etapaAcessoId").value = "";
        document.getElementById("tituloModalEtapasAcesso").textContent = "Cadastrar Etapas de Acesso";
        abrirModalPlataforma("modalEtapasAcesso");
    };

    document.getElementById("btnCancelarEtapasAcesso").onclick = () => fecharModalPlataforma("modalEtapasAcesso");

    formEtapas.onsubmit = (event) => {
        event.preventDefault();

        const etapaId = document.getElementById("etapaAcessoId").value;
        const dataInicio = document.getElementById("etapaDataInicio").value;
        const dataFim = document.getElementById("etapaDataFim").value;
        const acao = document.getElementById("etapaAcao").value.trim();
        const status = document.getElementById("etapaStatus").value;

        if (!dataInicio || !dataFim || !acao || !status) {
            alert("Preencha todos os campos da etapa.");
            return;
        }

        atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => {
            if (etapaId) {
                return {
                    ...dadosTurma,
                    etapas: dadosTurma.etapas.map((item) => item.id === etapaId
                        ? { ...item, dataInicio, dataFim, acao, status }
                        : item)
                };
            }

            return {
                ...dadosTurma,
                etapas: [...dadosTurma.etapas, {
                    id: `${Date.now()}`,
                    dataInicio,
                    dataFim,
                    acao,
                    status,
                    observacoes: ""
                }]
            };
        });

        fecharModalPlataforma("modalEtapasAcesso");
        renderizarTabelaEtapasAcesso(codigoTurma);
    };

    modalInformativo.onclick = (event) => {
        if (event.target === modalInformativo) {
            fecharModalPlataforma("modalInformativoPlataforma");
        }
    };

    modalDatas.onclick = (event) => {
        if (event.target === modalDatas) {
            fecharModalPlataforma("modalDatasSaepPlataforma");
        }
    };

    modalEtapas.onclick = (event) => {
        if (event.target === modalEtapas) {
            fecharModalPlataforma("modalEtapasAcesso");
        }
    };
}

function carregarHistoricoImportacaoSaep() {
    const dados = carregarTurmasDoStorage(SAEP_IMPORT_STORAGE_KEY);

    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return {};
    }

    return dados;
}

function salvarHistoricoImportacaoSaep(historico) {
    salvarTurmasNoStorage(historico, SAEP_IMPORT_STORAGE_KEY);
}

function obterHistoricoImportacaoTurmaSaep(codigoTurma) {
    const historico = carregarHistoricoImportacaoSaep();
    const itens = historico[codigoTurma];

    return Array.isArray(itens) ? itens : [];
}

function renderizarHistoricoImportacaoSaep(codigoTurma) {
    const container = document.getElementById("saepHistoricoImports");
    if (!container) {
        return;
    }

    const historicoTurma = obterHistoricoImportacaoTurmaSaep(codigoTurma);

    if (historicoTurma.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Nenhum simulado importado para esta turma.</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Arquivo</th>
                        <th>Importado em</th>
                        <th>Registros (Cruzamento/Itens/Detalhes/Individual)</th>
                    </tr>
                </thead>
                <tbody>
                    ${historicoTurma.slice().reverse().map((item) => `
                        <tr>
                            <td>${item.nomeArquivo || "-"}</td>
                            <td>${item.importadoEm ? new Date(item.importadoEm).toLocaleString("pt-BR") : "-"}</td>
                            <td>
                                ${item.resumo?.cruzamento ?? 0} /
                                ${item.resumo?.itens ?? 0} /
                                ${item.resumo?.detalhes ?? 0} /
                                ${item.resumo?.individual ?? 0}
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function exibirAbaSaepDetalhes(aba) {
    const secoes = document.querySelectorAll(".saep-section");
    const botoesSidebar = document.querySelectorAll(".saep-sidebar__item");

    secoes.forEach((secao) => {
        secao.style.display = "none";
    });

    const secaoAlvo = document.getElementById(`saepSection${aba.charAt(0).toUpperCase() + aba.slice(1)}`);
    if (secaoAlvo) {
        secaoAlvo.style.display = "block";
    }

    if (aba === "resumo") {
        const codigoTurma = new URLSearchParams(window.location.search).get("turma");
        if (codigoTurma) {
            renderizarResumoPedagogicoSaep(codigoTurma);
        }
    }

    botoesSidebar.forEach((item) => {
        item.classList.toggle("active", item.dataset.aba === aba);
    });
}

function obterWorksheetSaep(workbook, nomeAba) {
    const nomeEncontrado = (workbook.SheetNames || []).find((nome) => nome.trim() === nomeAba.trim());
    return nomeEncontrado ? workbook.Sheets[nomeEncontrado] : null;
}

async function importarArquivoDesempenhoSaep(codigoTurma, arquivo) {
    if (!window.XLSX) {
        throw new Error("A biblioteca SheetJS (XLSX) não foi carregada.");
    }

    const buffer = await arquivo.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });

    const abasFaltantes = SAEP_ABAS_OBRIGATORIAS.filter((nomeAba) => !obterWorksheetSaep(workbook, nomeAba));
    if (abasFaltantes.length > 0) {
        throw new Error(`A planilha não possui as abas obrigatórias: ${abasFaltantes.join(", ")}.`);
    }

    const cruzamento = window.XLSX.utils.sheet_to_json(obterWorksheetSaep(workbook, SAEP_ABAS_OBRIGATORIAS[0]), { defval: null, raw: false });
    const itens = window.XLSX.utils.sheet_to_json(obterWorksheetSaep(workbook, SAEP_ABAS_OBRIGATORIAS[1]), { defval: null, raw: false });
    const detalhes = window.XLSX.utils.sheet_to_json(obterWorksheetSaep(workbook, SAEP_ABAS_OBRIGATORIAS[2]), { defval: null, raw: false });
    const individual = window.XLSX.utils.sheet_to_json(obterWorksheetSaep(workbook, SAEP_ABAS_OBRIGATORIAS[3]), { defval: null, raw: false });

    const historico = carregarHistoricoImportacaoSaep();
    const historicoTurma = Array.isArray(historico[codigoTurma]) ? historico[codigoTurma] : [];

    historicoTurma.push({
        id: `${Date.now()}`,
        codigoTurma,
        nomeArquivo: arquivo.name,
        importadoEm: new Date().toISOString(),
        resumo: {
            cruzamento: cruzamento.length,
            itens: itens.length,
            detalhes: detalhes.length,
            individual: individual.length
        },
        dados: {
            cruzamento,
            itens,
            detalhes,
            individual
        }
    });

    historico[codigoTurma] = historicoTurma;
    salvarHistoricoImportacaoSaep(historico);
}

async function processarImportacaoSaepDaTurma(codigoTurma) {
    const inputArquivo = document.getElementById("saepUploadExcel");
    if (!inputArquivo || !inputArquivo.files || inputArquivo.files.length === 0) {
        alert("Selecione um arquivo Excel antes de importar.");
        return;
    }

    const arquivo = inputArquivo.files[0];

    try {
        await importarArquivoDesempenhoSaep(codigoTurma, arquivo);
        inputArquivo.value = "";
        renderizarHistoricoImportacaoSaep(codigoTurma);
        alert("Arquivo importado com sucesso. Histórico atualizado para a turma.");
    } catch (error) {
        console.error("Erro ao importar arquivo SAEP:", error);
        alert(error.message || "Não foi possível importar o arquivo.");
    }
}

function configurarImportacaoSaep(codigoTurma) {
    const botaoImportar = document.getElementById("btnImportarSaepExcel");
    if (botaoImportar) {
        botaoImportar.onclick = () => processarImportacaoSaepDaTurma(codigoTurma);
    }

    renderizarHistoricoImportacaoSaep(codigoTurma);
}

function carregarIndicadoresHistoricoSaep() {
    const dados = carregarTurmasDoStorage(SAEP_HISTORICO_INDICADORES_STORAGE_KEY);

    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return {};
    }

    return dados;
}

function normalizarHistoricoIndicadoresTurma(item) {
    if (!item || typeof item !== "object") {
        return { ativoId: "", versoes: [] };
    }

    // Migra estrutura legada (registro único) para estrutura versionada.
    if (Array.isArray(item.versoes)) {
        return {
            ativoId: item.ativoId || "",
            versoes: item.versoes
        };
    }

    if (Object.prototype.hasOwnProperty.call(item, "notaEscola")
        || Object.prototype.hasOwnProperty.call(item, "notaSegmento")
        || Object.prototype.hasOwnProperty.call(item, "notaObjetivaSegmento")
        || Object.prototype.hasOwnProperty.call(item, "notaPraticaSegmento")
        || Object.prototype.hasOwnProperty.call(item, "capacidadesCriticas")) {
        const id = `${Date.now()}_mig`;
        return {
            ativoId: id,
            versoes: [{
                id,
                criadoEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString(),
                notaEscola: item.notaEscola ?? "",
                notaSegmento: item.notaSegmento ?? "",
                notaObjetivaSegmento: item.notaObjetivaSegmento ?? "",
                notaPraticaSegmento: item.notaPraticaSegmento ?? "",
                capacidadesCriticas: item.capacidadesCriticas || ""
            }]
        };
    }

    return { ativoId: "", versoes: [] };
}

function obterHistoricoIndicadoresDaTurma(codigoTurma) {
    const dados = carregarIndicadoresHistoricoSaep();
    return normalizarHistoricoIndicadoresTurma(dados[codigoTurma]);
}

function obterIndicadoresHistoricoDaTurma(codigoTurma) {
    const historico = obterHistoricoIndicadoresDaTurma(codigoTurma);
    const ativo = historico.versoes.find((item) => item.id === historico.ativoId)
        || historico.versoes[historico.versoes.length - 1]
        || null;

    return {
        registroId: ativo?.id || "",
        notaEscola: ativo?.notaEscola ?? "",
        notaSegmento: ativo?.notaSegmento ?? "",
        notaObjetivaSegmento: ativo?.notaObjetivaSegmento ?? "",
        notaPraticaSegmento: ativo?.notaPraticaSegmento ?? "",
        capacidadesCriticas: ativo?.capacidadesCriticas || ""
    };
}

function salvarIndicadoresHistoricoDaTurma(codigoTurma, indicadores, registroId = "") {
    const dados = carregarIndicadoresHistoricoSaep();
    const historico = normalizarHistoricoIndicadoresTurma(dados[codigoTurma]);

    if (registroId) {
        historico.versoes = historico.versoes.map((item) => item.id === registroId
            ? {
                ...item,
                ...indicadores,
                atualizadoEm: new Date().toISOString()
            }
            : item);
        historico.ativoId = registroId;
    } else {
        const novoId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        historico.versoes.push({
            id: novoId,
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            ...indicadores
        });
        historico.ativoId = novoId;
    }

    dados[codigoTurma] = historico;
    salvarTurmasNoStorage(dados, SAEP_HISTORICO_INDICADORES_STORAGE_KEY);
}

function excluirIndicadorHistoricoDaTurma(codigoTurma, registroId) {
    const dados = carregarIndicadoresHistoricoSaep();
    const historico = normalizarHistoricoIndicadoresTurma(dados[codigoTurma]);

    historico.versoes = historico.versoes.filter((item) => item.id !== registroId);
    historico.ativoId = historico.versoes.length > 0 ? historico.versoes[historico.versoes.length - 1].id : "";

    dados[codigoTurma] = historico;
    salvarTurmasNoStorage(dados, SAEP_HISTORICO_INDICADORES_STORAGE_KEY);
}

function obterCodigosTurmasPorCurso(curso) {
    const andamento = carregarTurmasDoStorage(STORAGE_KEY) || [];
    const finalizadas = carregarTurmasDoStorage(STORAGE_KEY_FINALIZADAS) || [];

    return Array.from(new Set([...andamento, ...finalizadas]
        .filter((turma) => turma?.curso === curso)
        .map((turma) => turma.codigoTurma)
        .filter(Boolean)));
}

function escaparValorCsv(valor) {
    const texto = `${valor ?? ""}`.replace(/"/g, '""');
    return `"${texto}"`;
}

function exportarAvaliacoesCursoCsv(avaliacoes, tituloArquivo) {
    const cabecalho = ["Turma", "Data", "Nota media", "Observacoes"];
    const linhas = [cabecalho.join(",")]
        .concat(avaliacoes.map((item) => [
            escaparValorCsv(item.codigoTurma || "-"),
            escaparValorCsv(formatarDataParaExibirSaep(item.data)),
            escaparValorCsv(item.notaMedia || "-"),
            escaparValorCsv(item.observacoes || "-")
        ].join(",")));

    const csv = linhas.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = tituloArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function renderizarEstadoHistorico(estado = "carregando", mensagem = "") {
    const container = document.getElementById("saepHistoricoConteudo");
    if (!container) {
        return;
    }

    if (estado === "vazio") {
        container.innerHTML = `
            <div class="saep-historico-empty">
                <strong>Sem dados para exibir</strong>
                <p>${mensagem || "Ainda não há informações cadastradas para este filtro."}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="saep-historico-loading" aria-live="polite">
            <span class="saep-historico-loading__dot" aria-hidden="true"></span>
            <p>Carregando informações...</p>
        </div>
    `;
}

function renderizarTabelaHistoricoAvaliacoes(codigoTurma, curso, tipo) {
    const container = document.getElementById("saepHistoricoConteudo");
    if (!container) {
        return;
    }

    const codigosDoCurso = new Set(obterCodigosTurmasPorCurso(curso));
    const storageKey = tipo === "praticas" ? "saepAvaliacoesPratico" : "saepAvaliacoesObjetivo";
    const titulo = tipo === "praticas" ? "Avaliações Práticas" : "Avaliações Objetivas";
    const avaliacoes = (carregarTurmasDoStorage(storageKey) || []).filter((item) => codigosDoCurso.has(item.codigoTurma));
    const slugCurso = (curso || "curso").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "curso";

    container.innerHTML = `
        <div class="saep-historico-intro">
            <p class="saep-muted">${titulo}</p>
            <h4 class="saep-historico-intro__title">Visão por Curso</h4>
            <p class="saep-muted">Turma base: ${codigoTurma} · Curso: ${curso || "-"}</p>
            <div class="saep-historico-kpis">
                <span class="saep-historico-chip">Registros: ${avaliacoes.length}</span>
                <span class="saep-historico-chip">Turmas do curso: ${codigosDoCurso.size}</span>
            </div>
        </div>
        <div class="saep-historico-head">
            <button type="button" class="btn-secondary" id="btnExportarCsvHistorico">Exportar CSV do Curso</button>
        </div>
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Turma</th>
                        <th>Data</th>
                        <th>Nota média</th>
                        <th>Observações</th>
                    </tr>
                </thead>
                <tbody>
                    ${avaliacoes.length === 0
        ? '<tr><td colspan="4">Nenhuma avaliação encontrada para este curso.</td></tr>'
        : avaliacoes.map((item) => `
                        <tr>
                            <td>${item.codigoTurma || "-"}</td>
                            <td>${formatarDataParaExibirSaep(item.data)}</td>
                            <td>${item.notaMedia || "-"}</td>
                            <td>${item.observacoes || "-"}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    const botaoExportar = document.getElementById("btnExportarCsvHistorico");
    if (botaoExportar) {
        botaoExportar.onclick = () => {
            const sufixo = tipo === "praticas" ? "avaliacoes-praticas" : "avaliacoes-objetivas";
            exportarAvaliacoesCursoCsv(avaliacoes, `${slugCurso}-${sufixo}.csv`);
        };
    }
}

function renderizarFormularioHistoricoSaep(codigoTurma, curso, resumoBase) {
    const container = document.getElementById("saepHistoricoConteudo");
    if (!container) {
        return;
    }

    const indicadores = obterIndicadoresHistoricoDaTurma(codigoTurma);
    const historico = obterHistoricoIndicadoresDaTurma(codigoTurma);
    const versoesOrdenadas = historico.versoes.slice().sort((a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());

    container.innerHTML = `
        <div class="saep-historico-intro">
            <p class="saep-muted">Indicadores Gerais</p>
            <h4 class="saep-historico-intro__title">SAEP por Turma</h4>
            <p class="saep-muted">Preencha os indicadores gerais do SAEP e mantenha o histórico de versões.</p>
            <p class="saep-muted">Turma: ${codigoTurma} · Curso: ${curso || "-"}</p>
            <div class="saep-historico-kpis">
                <span class="saep-historico-chip">Ações: ${resumoBase.totalAcoes}</span>
                <span class="saep-historico-chip">Avaliações: ${resumoBase.totalAvaliacoes}</span>
            </div>
        </div>
        <form id="formHistoricoIndicadoresSaep" class="form-grid saep-historico-form">
            <input id="histRegistroId" type="hidden" value="${indicadores.registroId}">
            <label>
                Nota da Escola
                <input id="histNotaEscola" type="number" step="0.1" min="0" required value="${indicadores.notaEscola}">
            </label>
            <label>
                Nota por Segmento
                <input id="histNotaSegmento" type="number" step="0.1" min="0" required value="${indicadores.notaSegmento}">
            </label>
            <label>
                Nota da Prova Objetiva por Segmento
                <input id="histNotaObjetivaSegmento" type="number" step="0.1" min="0" required value="${indicadores.notaObjetivaSegmento}">
            </label>
            <label>
                Nota da Prova Prática por Segmento
                <input id="histNotaPraticaSegmento" type="number" step="0.1" min="0" required value="${indicadores.notaPraticaSegmento}">
            </label>
            <label class="saep-full-width">
                Capacidades Críticas
                <textarea id="histCapacidadesCriticas" rows="4" placeholder="Descreva as capacidades críticas identificadas...">${indicadores.capacidadesCriticas}</textarea>
                <small class="saep-muted">Use este campo para observações pedagógicas relevantes do ciclo avaliado.</small>
            </label>
            <div class="form-actions saep-full-width">
                <button type="submit" class="btn-primary">Salvar Indicadores Gerais</button>
                <button type="button" class="btn-secondary" id="btnNovoRegistroIndicador">Novo Registro</button>
            </div>
        </form>
        <div class="saep-historico-head">
            <p class="saep-muted">Histórico de versões dos indicadores (edição e exclusão por data).</p>
        </div>
        <div class="table-scroll saep-historico-versoes">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Data de Atualização</th>
                        <th>Nota da Escola</th>
                        <th>Nota por Segmento</th>
                        <th>Objetiva por Segmento</th>
                        <th>Prática por Segmento</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${versoesOrdenadas.length === 0
        ? '<tr><td colspan="6">Nenhum indicador salvo.</td></tr>'
        : versoesOrdenadas.map((item) => `
                        <tr>
                            <td>${new Date(item.atualizadoEm || item.criadoEm).toLocaleString("pt-BR")}</td>
                            <td>${item.notaEscola}</td>
                            <td>${item.notaSegmento}</td>
                            <td>${item.notaObjetivaSegmento}</td>
                            <td>${item.notaPraticaSegmento}</td>
                            <td>
                                <button type="button" class="btn-secondary saep-inline-btn" data-editar-indicador="${item.id}">Editar</button>
                                <button type="button" class="btn-delete saep-inline-danger" data-excluir-indicador="${item.id}">🗑️</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
        <ul class="saep-list">
            <li>Turma cadastrada em ${formatarDataParaExibirSaep(resumoBase.dataInicio || "")}</li>
            <li>${resumoBase.totalAcoes} ação(ões) no plano de ação</li>
            <li>${resumoBase.totalAvaliacoes} avaliação(ões) registrada(s)</li>
        </ul>
    `;

    const form = document.getElementById("formHistoricoIndicadoresSaep");
    if (!form) {
        return;
    }

    form.onsubmit = (event) => {
        event.preventDefault();

        const registroId = document.getElementById("histRegistroId").value;

        salvarIndicadoresHistoricoDaTurma(codigoTurma, {
            notaEscola: document.getElementById("histNotaEscola").value,
            notaSegmento: document.getElementById("histNotaSegmento").value,
            notaObjetivaSegmento: document.getElementById("histNotaObjetivaSegmento").value,
            notaPraticaSegmento: document.getElementById("histNotaPraticaSegmento").value,
            capacidadesCriticas: document.getElementById("histCapacidadesCriticas").value.trim()
        }, registroId);

        alert("Indicadores gerais salvos com sucesso.");
        renderizarFormularioHistoricoSaep(codigoTurma, curso, resumoBase);
    };

    const botaoNovo = document.getElementById("btnNovoRegistroIndicador");
    if (botaoNovo) {
        botaoNovo.onclick = () => {
            document.getElementById("histRegistroId").value = "";
            document.getElementById("histNotaEscola").value = "";
            document.getElementById("histNotaSegmento").value = "";
            document.getElementById("histNotaObjetivaSegmento").value = "";
            document.getElementById("histNotaPraticaSegmento").value = "";
            document.getElementById("histCapacidadesCriticas").value = "";
        };
    }

    container.querySelectorAll("[data-editar-indicador]").forEach((botao) => {
        botao.onclick = () => {
            const id = botao.getAttribute("data-editar-indicador");
            const registro = versoesOrdenadas.find((item) => item.id === id);
            if (!registro) {
                return;
            }

            document.getElementById("histRegistroId").value = registro.id;
            document.getElementById("histNotaEscola").value = registro.notaEscola;
            document.getElementById("histNotaSegmento").value = registro.notaSegmento;
            document.getElementById("histNotaObjetivaSegmento").value = registro.notaObjetivaSegmento;
            document.getElementById("histNotaPraticaSegmento").value = registro.notaPraticaSegmento;
            document.getElementById("histCapacidadesCriticas").value = registro.capacidadesCriticas || "";
        };
    });

    container.querySelectorAll("[data-excluir-indicador]").forEach((botao) => {
        botao.onclick = () => {
            const id = botao.getAttribute("data-excluir-indicador");
            const confirmar = window.confirm("Deseja realmente excluir este registro de indicadores?");
            if (!confirmar) {
                return;
            }

            excluirIndicadorHistoricoDaTurma(codigoTurma, id);
            renderizarFormularioHistoricoSaep(codigoTurma, curso, resumoBase);
        };
    });
}

function renderizarSubAbaHistoricoSaep(subAba, codigoTurma, turma, resumoBase) {
    const abas = document.querySelectorAll("#saepHistoricoTabs .saep-historico-tab");
    abas.forEach((aba) => {
        aba.classList.toggle("active", aba.dataset.subaba === subAba);
    });

    renderizarEstadoHistorico("carregando");

    window.setTimeout(() => {
        if (subAba === "praticas") {
            const codigosDoCurso = new Set(obterCodigosTurmasPorCurso(turma.curso));
            const avaliacoesPraticas = (carregarTurmasDoStorage("saepAvaliacoesPratico") || [])
                .filter((item) => codigosDoCurso.has(item.codigoTurma));
            if (avaliacoesPraticas.length === 0) {
                renderizarEstadoHistorico("vazio", "Nenhuma avaliação prática encontrada para este curso.");
                return;
            }
            renderizarTabelaHistoricoAvaliacoes(codigoTurma, turma.curso, "praticas");
            return;
        }

        if (subAba === "objetivas") {
            const codigosDoCurso = new Set(obterCodigosTurmasPorCurso(turma.curso));
            const avaliacoesObjetivas = (carregarTurmasDoStorage("saepAvaliacoesObjetivo") || [])
                .filter((item) => codigosDoCurso.has(item.codigoTurma));
            if (avaliacoesObjetivas.length === 0) {
                renderizarEstadoHistorico("vazio", "Nenhuma avaliação objetiva encontrada para este curso.");
                return;
            }
            renderizarTabelaHistoricoAvaliacoes(codigoTurma, turma.curso, "objetivas");
            return;
        }

        renderizarFormularioHistoricoSaep(codigoTurma, turma.curso, resumoBase);
    }, 40);
}

function configurarHistoricoSaep(codigoTurma, turma, resumoBase) {
    const abas = document.querySelectorAll("#saepHistoricoTabs .saep-historico-tab");
    if (abas.length === 0) {
        return;
    }

    abas.forEach((aba) => {
        aba.onclick = () => {
            renderizarSubAbaHistoricoSaep(aba.dataset.subaba || "saep", codigoTurma, turma, resumoBase);
        };
    });

    renderizarSubAbaHistoricoSaep("saep", codigoTurma, turma, resumoBase);
}

function formatarDataParaExibirSaep(data) {
    if (!data) {
        return "-";
    }
    return formatarDataParaExibir(data);
}

function calcularPercentualExecucaoGeral(codigoTurma, acoes = []) {
    const plataformas = obterDadosPlataformasTurma(codigoTurma);
    const etapas = plataformas?.etapas || [];
    const totalItens = acoes.length + etapas.length;
    if (totalItens === 0) {
        return 0;
    }

    const concluidasAcoes = acoes.filter((acao) => acao.status === "Concluído").length;
    const concluidasEtapas = etapas.filter((etapa) => etapa.status === "Concluída").length;
    return Math.round(((concluidasAcoes + concluidasEtapas) / totalItens) * 100);
}

function renderizarResumoPedagogicoSaep(codigoTurma) {
    const dados = carregarDadosSaepDaTurma(codigoTurma);
    const { datas, acoes, avaliacoesObjetivo, avaliacoesPratico } = dados;
    const indicadores = calcularIndicadoresSaep({ acoes, avaliacoesObjetivo, avaliacoesPratico });
    const percentualExecucaoGeral = calcularPercentualExecucaoGeral(codigoTurma, acoes);

    document.getElementById("saepResumoCards").innerHTML = `
        <div class="saep-metric-card">
            <span>Média da turma</span>
            <strong>${indicadores.mediaTurma !== "-" ? indicadores.mediaTurma : "Sem avaliações"}</strong>
        </div>
        <div class="saep-metric-card">
            <span>Meta</span>
            <strong>${indicadores.meta}</strong>
        </div>
        <div class="saep-metric-card">
            <span>Alunos abaixo da meta</span>
            <strong>${indicadores.alunosAbaixoMeta}</strong>
        </div>
        <div class="saep-metric-card">
            <span>Execução do plano + etapas</span>
            <strong>${percentualExecucaoGeral}%</strong>
        </div>
    `;

    const alertas = [];
    if (!datas.saepObjetivo && !datas.saepPratico) {
        alertas.push("Turma sem data de SAEP cadastrada.");
    }
    if (acoes.length === 0) {
        alertas.push("Sem plano de ação registrado.");
    }
    if (indicadores.mediaTurma !== "-" && Number(indicadores.mediaTurma) < indicadores.meta) {
        alertas.push("Média abaixo da meta.");
    }
    if (indicadores.alunosAbaixoMeta > 0) {
        alertas.push("Há alunos com desempenho abaixo da meta.");
    }
    if (indicadores.principais.length > 0) {
        alertas.push(`Capacidades críticas recorrentes: ${indicadores.principais.map(([nome]) => nome).join(", ")}.`);
    }

    document.getElementById("saepAlertas").innerHTML = alertas.length > 0
        ? alertas.map((alerta) => `<div class="saep-alert">${alerta}</div>`).join("")
        : `<div class="saep-alert saep-alert--ok">Nenhum alerta identificado.</div>`;
}

function calcularIndicadoresSaep(dados) {
    const { acoes = [], avaliacoesObjetivo = [], avaliacoesPratico = [] } = dados;
    const todasAvaliacoes = [...avaliacoesObjetivo, ...avaliacoesPratico];
    const mediaTurma = todasAvaliacoes.length > 0
        ? (todasAvaliacoes.reduce((soma, item) => soma + Number(item.notaMedia || 0), 0) / todasAvaliacoes.length).toFixed(1)
        : "-";
    const meta = 7.0;
    const alunosAbaixoMeta = todasAvaliacoes.reduce((total, item) => total + (Number(item.notaMedia || 0) < meta ? 1 : 0), 0);
    const percentualExecucao = acoes.length > 0
        ? Math.round((acoes.filter((acao) => acao.status === "Concluído").length / acoes.length) * 100)
        : 0;
    const capacidadesCriticas = todasAvaliacoes.flatMap((avaliacao) => (avaliacao.capacidades || []).filter((cap) => cap.situacao === "crítica"));
    const capacidadesCriticasMaisFrequentes = capacidadesCriticas.reduce((acc, cap) => {
        acc[cap.capacidade] = (acc[cap.capacidade] || 0) + 1;
        return acc;
    }, {});
    const principais = Object.entries(capacidadesCriticasMaisFrequentes).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
        mediaTurma,
        meta,
        alunosAbaixoMeta,
        percentualExecucao,
        principais
    };
}

function renderizarDetalhesSaep() {
    const params = new URLSearchParams(window.location.search);
    const codigoTurma = params.get("turma");

    if (!codigoTurma) {
        return;
    }

    const dados = carregarDadosSaepDaTurma(codigoTurma);
    const { turma, datas, acoes, avaliacoesObjetivo, avaliacoesPratico } = dados;
    if (!turma) {
        return;
    }

    document.getElementById("saepDetalheTitulo").textContent = turma.codigoTurma;
    document.getElementById("saepDetalheSubtitulo").textContent = `${turma.curso} · ${turma.instrutor} · Fim ${formatarDataParaExibirSaep(turma.dataFim)}`;

    document.getElementById("btnEditarDataSaep").onclick = () => abrirModalCadastroSaep(codigoTurma);

    renderizarResumoPedagogicoSaep(codigoTurma);

    document.getElementById("saepGraficoNotas").innerHTML = `<div class="saep-empty-state">Evolução das notas será exibida com os simulados cadastrados.</div>`;
    document.getElementById("saepGraficoCapacidades").innerHTML = `<div class="saep-empty-state">Desempenho por capacidade será exibido ao cadastrar avaliações.</div>`;
    document.getElementById("saepGraficoSituacao").innerHTML = `<div class="saep-empty-state">Distribuição da situação da turma aparecerá aqui.</div>`;
    document.getElementById("saepGraficoPlano").innerHTML = `<div class="saep-empty-state">Andamento do plano de ação aparecerá aqui.</div>`;

    configurarHistoricoSaep(codigoTurma, turma, {
        dataInicio: turma.dataInicio || "",
        totalAcoes: acoes.length,
        totalAvaliacoes: avaliacoesObjetivo.length + avaliacoesPratico.length
    });

    configurarPlataformasSaep(codigoTurma, turma.instrutor);
    configurarImportacaoSaep(codigoTurma);
    exibirAbaSaepDetalhes("resumo");

    document.querySelectorAll(".saep-sidebar__item").forEach((botao) => {
        botao.onclick = () => {
            const aba = botao.dataset.aba;
            exibirAbaSaepDetalhes(aba);
        };
    });

    document.getElementById("btnNovaAcao").onclick = () => abrirModalAcaoSaep();
    document.getElementById("btnNovaAvaliacaoObjetivo").onclick = () => abrirModalAvaliacaoSaep("objetivo");
    document.getElementById("btnNovaAvaliacaoPratico").onclick = () => abrirModalAvaliacaoSaep("pratico");

    renderizarTabelaPlanoSaep(codigoTurma);
    renderizarTabelaAvaliacoesSaep(codigoTurma, "objetivo");
    renderizarTabelaAvaliacoesSaep(codigoTurma, "pratico");
}

function renderizarTabelaPlanoSaep(codigoTurma) {
    const container = document.getElementById("saepTabelaPlano");
    const acoes = (carregarTurmasDoStorage("saepAcoes") || []).filter((item) => item.codigoTurma === codigoTurma);

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Título</th>
                        <th>Data</th>
                        <th>Responsável</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${acoes.length === 0 ? '<tr><td colspan="5">Nenhuma ação cadastrada.</td></tr>' : acoes.map((acao) => `
                        <tr>
                            <td>${acao.titulo}</td>
                            <td>${formatarDataParaExibirSaep(acao.data)}</td>
                            <td>${acao.responsavel}</td>
                            <td>${acao.status}</td>
                            <td>
                                <button class="btn-edit" onclick="abrirModalAcaoSaep('${acao.id}')">✏️</button>
                                <button class="btn-delete" onclick="excluirAcaoSaep('${acao.id}')">🗑️</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function abrirModalAcaoSaep(id = "") {
    const modal = document.getElementById("modalCadastroAcaoSaep");
    const form = document.getElementById("formCadastroAcaoSaep");
    const titulo = document.getElementById("tituloModalAcaoSaep");
    const idInput = document.getElementById("acaoIdSaep");
    const turmaInput = document.getElementById("acaoTurmaSaep");
    const params = new URLSearchParams(window.location.search);
    const codigoTurma = params.get("turma");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        form.reset();
    }

    if (titulo) {
        titulo.textContent = id ? "Editar ação" : "Nova ação";
    }

    if (idInput) {
        idInput.value = id;
    }

    if (turmaInput) {
        turmaInput.value = codigoTurma || "";
    }

    if (id) {
        const acoes = (carregarTurmasDoStorage("saepAcoes") || []).find((item) => item.id === id);
        if (acoes) {
            document.getElementById("acaoTituloSaep").value = acoes.titulo || "";
            document.getElementById("acaoDataSaep").value = acoes.data || "";
            document.getElementById("acaoResponsavelSaep").value = acoes.responsavel || "";
            document.getElementById("acaoStatusSaep").value = acoes.status || "Em andamento";
            document.getElementById("acaoDescricaoSaep").value = acoes.descricao || "";
        }
    }
}

function fecharModalAcaoSaep() {
    const modal = document.getElementById("modalCadastroAcaoSaep");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
}

function salvarAcaoSaep(event) {
    event.preventDefault();

    const id = document.getElementById("acaoIdSaep").value;
    const codigoTurma = document.getElementById("acaoTurmaSaep").value.trim();
    const acao = {
        id: id || `${Date.now()}`,
        codigoTurma,
        titulo: document.getElementById("acaoTituloSaep").value.trim(),
        data: document.getElementById("acaoDataSaep").value,
        responsavel: document.getElementById("acaoResponsavelSaep").value.trim(),
        status: document.getElementById("acaoStatusSaep").value,
        descricao: document.getElementById("acaoDescricaoSaep").value.trim()
    };

    if (!acao.titulo || !acao.data || !acao.responsavel || !acao.descricao) {
        alert("Preencha todos os campos da ação.");
        return;
    }

    const acoes = carregarTurmasDoStorage("saepAcoes") || [];
    const indice = acoes.findIndex((item) => item.id === acao.id);
    if (indice >= 0) {
        acoes[indice] = acao;
    } else {
        acoes.push(acao);
    }

    salvarTurmasNoStorage(acoes, "saepAcoes");
    fecharModalAcaoSaep();
    renderizarDetalhesSaep();
}

function excluirAcaoSaep(id) {
    const acoes = (carregarTurmasDoStorage("saepAcoes") || []).filter((item) => item.id !== id);
    salvarTurmasNoStorage(acoes, "saepAcoes");
    renderizarDetalhesSaep();
}

function abrirModalAvaliacaoSaep(tipo = "objetivo") {
    const modal = document.getElementById("modalCadastroAvaliacaoSaep");
    const form = document.getElementById("formCadastroAvaliacaoSaep");
    const titulo = document.getElementById("tituloModalAvaliacaoSaep");
    const tipoInput = document.getElementById("avaliacaoTipoSaep");
    const turmaInput = document.getElementById("avaliacaoTurmaSaep");
    const params = new URLSearchParams(window.location.search);
    const codigoTurma = params.get("turma");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        form.reset();
    }

    if (titulo) {
        titulo.textContent = tipo === "pratico" ? "Nova avaliação prática" : "Nova avaliação objetiva";
    }

    if (tipoInput) {
        tipoInput.value = tipo;
    }

    if (turmaInput) {
        turmaInput.value = codigoTurma || "";
    }
}

function fecharModalAvaliacaoSaep() {
    const modal = document.getElementById("modalCadastroAvaliacaoSaep");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
}

function salvarAvaliacaoSaep(event) {
    event.preventDefault();

    const tipo = document.getElementById("avaliacaoTipoSaep").value;
    const codigoTurma = document.getElementById("avaliacaoTurmaSaep").value.trim();
    const avaliacao = {
        id: `${Date.now()}`,
        codigoTurma,
        tipo,
        data: document.getElementById("avaliacaoDataSaep").value,
        notaMedia: document.getElementById("avaliacaoNotaSaep").value,
        observacoes: document.getElementById("avaliacaoObservacoesSaep").value.trim(),
        alunosBaixoDesempenho: (document.getElementById("avaliacaoAlunosSaep").value || "").split("\n").filter(Boolean).map((linha) => {
            const [nome, nota, capacidades] = linha.split("|").map((item) => item.trim());
            return { nome, nota, capacidades };
        }),
        capacidades: (document.getElementById("avaliacaoCapacidadesSaep").value || "").split("\n").filter(Boolean).map((linha) => {
            const [capacidade, nota, situacao] = linha.split("|").map((item) => item.trim());
            return { capacidade, nota, situacao: situacao || "atenção" };
        })
    };

    const storageKey = tipo === "pratico" ? "saepAvaliacoesPratico" : "saepAvaliacoesObjetivo";
    const avaliacoes = carregarTurmasDoStorage(storageKey) || [];
    avaliacoes.push(avaliacao);
    salvarTurmasNoStorage(avaliacoes, storageKey);
    fecharModalAvaliacaoSaep();
    renderizarDetalhesSaep();
}

function renderizarTabelaAvaliacoesSaep(codigoTurma, tipo) {
    const container = tipo === "objetivo" ? document.getElementById("saepTabelaObjetivos") : document.getElementById("saepTabelaPraticos");
    const storageKey = tipo === "objetivo" ? "saepAvaliacoesObjetivo" : "saepAvaliacoesPratico";
    const avaliacoes = (carregarTurmasDoStorage(storageKey) || []).filter((item) => item.codigoTurma === codigoTurma);

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Nota média</th>
                        <th>Observações</th>
                        <th>Alunos com baixo desempenho</th>
                        <th>Capacidades avaliadas</th>
                    </tr>
                </thead>
                <tbody>
                    ${avaliacoes.length === 0 ? '<tr><td colspan="5">Nenhuma avaliação cadastrada.</td></tr>' : avaliacoes.map((avaliacao) => `
                        <tr>
                            <td>${formatarDataParaExibirSaep(avaliacao.data)}</td>
                            <td>${avaliacao.notaMedia}</td>
                            <td>${avaliacao.observacoes || "-"}</td>
                            <td>${(avaliacao.alunosBaixoDesempenho || []).map((aluno) => `${aluno.nome} (${aluno.nota})`).join("<br>") || "-"}</td>
                            <td>${(avaliacao.capacidades || []).map((cap) => `${cap.capacidade} · ${cap.nota} · ${cap.situacao}`).join("<br>") || "-"}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderizarTurmasSaep() {
    const tabela = document.getElementById("tabelaTurmasSaep");
    const painel = document.getElementById("painelSaepDetalhes");
    const conteudo = document.getElementById("conteudoSaep");

    if (!tabela) {
        return;
    }

    const corpo = tabela.querySelector("tbody");
    if (!corpo) {
        return;
    }

    corpo.innerHTML = "";

    if (painel) {
        painel.style.display = "none";
    }

    if (conteudo) {
        conteudo.innerHTML = "";
    }

    const turmas = carregarTurmasDoStorage(STORAGE_KEY);
    if (turmas.length === 0) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.colSpan = 6;
        celula.textContent = "Nenhuma turma cadastrada.";
        linha.appendChild(celula);
        corpo.appendChild(linha);
        return;
    }

    const registrosSaep = carregarTurmasDoStorage("saepDatas") || [];

    turmas.forEach((turma) => {
        const linha = document.createElement("tr");
        const registro = registrosSaep.find((item) => item.codigoTurma === turma.codigoTurma) || {};
        linha.innerHTML = `
            <td><button class="link-button" data-turma="${turma.codigoTurma}">${turma.codigoTurma}</button></td>
            <td>${turma.curso}</td>
            <td>${formatarDataParaExibir(turma.dataFim)}</td>
            <td>${registro.saepObjetivo ? formatarDataParaExibir(registro.saepObjetivo) : "-"}</td>
            <td>${registro.saepPratico ? formatarDataParaExibir(registro.saepPratico) : "-"}</td>
            <td>${turma.instrutor}</td>
            <td><button type="button" class="btn-edit" onclick="abrirModalCadastroSaep('${turma.codigoTurma}')" title="Cadastrar datas SAEP">✏️</button></td>
        `;
        corpo.appendChild(linha);
    });

    tabela.querySelectorAll(".link-button").forEach((botao) => {
        botao.addEventListener("click", () => {
            abrirPaginaDetalhesSaep(botao.dataset.turma);
        });
    });
}

function mostrarAbaSaep(aba, turmaSelecionada = null) {
    const conteudo = document.getElementById("conteudoSaep");
    const botoes = document.querySelectorAll("#painelSaepDetalhes .seeduc-submenu__item");

    if (!conteudo) {
        return;
    }

    botoes.forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.aba === aba);
    });

    let turma = turmaSelecionada;

    if (!turma) {
        const botaoAtivo = document.querySelector("#tabelaTurmasSaep .link-button.active");
        if (botaoAtivo) {
            const codigoTurma = botaoAtivo.dataset.turma;
            turma = carregarTurmasDoStorage(STORAGE_KEY).find((item) => item.codigoTurma === codigoTurma);
        }
    }

    if (!turma) {
        conteudo.innerHTML = "<p>Selecione uma turma.</p>";
        return;
    }

    let texto = "";
    if (aba === "plano") {
        texto = `<h3>Plano de ação</h3><p>Registrar ações pedagógicas para a turma ${turma.codigoTurma}.</p>`;
    } else if (aba === "objetivos") {
        texto = `<h3>Simulados objetivos</h3><p>Organizar os simulados objetivos da turma ${turma.codigoTurma}.</p>`;
    } else if (aba === "praticos") {
        texto = `<h3>Simulados práticos</h3><p>Organizar os simulados práticos da turma ${turma.codigoTurma}.</p>`;
    }

    conteudo.innerHTML = `
        <p><strong>Turma:</strong> ${turma.codigoTurma}</p>
        <p><strong>Curso:</strong> ${turma.curso}</p>
        <p><strong>Instrutor:</strong> ${turma.instrutor}</p>
        ${texto}
    `;
}

function renderizarDetalhesTurmaNaPagina() {
    const codigoTurma = new URLSearchParams(window.location.search).get("turma");
    const titulo = document.getElementById("tituloTurmaOcorrencia");
    const dadosTurma = document.getElementById("dadosTurmaOcorrencia");
    const containerAlunos = document.getElementById("listaAlunosOcorrencia");
    const botaoCadastrar = document.getElementById("btnCadastrarAlunos");
    const campoCodigo = document.getElementById("codigoTurmaOcorrencia");

    if (!titulo || !dadosTurma || !containerAlunos || !botaoCadastrar || !campoCodigo) {
        return;
    }

    if (!codigoTurma) {
        titulo.textContent = "Turma não selecionada";
        dadosTurma.textContent = "Volte para a lista de turmas e selecione uma turma.";
        containerAlunos.innerHTML = "";
        return;
    }

    const turma = carregarTurmasDoStorage(STORAGE_KEY).find((item) => item.codigoTurma === codigoTurma);
    if (!turma) {
        titulo.textContent = "Turma não encontrada";
        dadosTurma.textContent = "A turma selecionada não está mais disponível.";
        containerAlunos.innerHTML = "";
        return;
    }

    titulo.textContent = turma.codigoTurma;
    dadosTurma.textContent = `${turma.curso} | ${turma.instrutor} | ${formatarDataParaExibir(turma.dataInicio)} a ${formatarDataParaExibir(turma.dataFim)}`;
    campoCodigo.value = codigoTurma;
    botaoCadastrar.onclick = () => cadastrarAlunosDaTurma(codigoTurma);

    const alunos = carregarAlunosDaTurma(codigoTurma);
    const ocorrencias = carregarOcorrenciasDaTurma(codigoTurma);
    containerAlunos.innerHTML = "";

    if (alunos.length === 0) {
        const vazio = document.createElement("div");
        vazio.className = "empty-state";
        vazio.textContent = "Nenhum aluno cadastrado para esta turma. Use o botão para registrar os nomes.";
        containerAlunos.appendChild(vazio);
        return;
    }

    const fragmento = document.createDocumentFragment();
    alunos.forEach((aluno) => {
        const card = document.createElement("div");
        card.className = "student-card";
        const ocorrenciasAluno = ocorrencias.filter((item) => item.aluno === aluno);

        card.innerHTML = `
            <div class="student-card__header">
                <strong>${aluno}</strong>
                <button type="button" class="btn-primary student-card__button">Adicionar ocorrência</button>
            </div>
            <div class="student-card__occurrences">
                ${ocorrenciasAluno.length > 0 ? ocorrenciasAluno.map((item) => `
                    <div class="occurrence-item">
                        <span class="occurrence-item__type">${item.tipo}</span>
                        <p>${item.descricao}</p>
                    </div>
                `).join("") : '<p class="empty-state empty-state--small">Nenhuma ocorrência registrada para este aluno.</p>'}
            </div>
        `;

        const botao = card.querySelector("button");
        botao.addEventListener("click", () => abrirModalOcorrencia(codigoTurma, aluno));
        fragmento.appendChild(card);
    });

    containerAlunos.appendChild(fragmento);
}

function cadastrarAlunosDaTurma(codigoTurma) {
    const nome = window.prompt("Digite os nomes dos alunos separados por vírgula:");
    if (!nome) {
        return;
    }

    const alunosNovos = nome.split(",").map((item) => item.trim()).filter(Boolean);
    if (alunosNovos.length === 0) {
        return;
    }

    const alunosExistentes = carregarAlunosDaTurma(codigoTurma);
    const alunosUnicos = Array.from(new Set([...alunosExistentes, ...alunosNovos]));
    salvarAlunosDaTurma(codigoTurma, alunosUnicos);
    renderizarDetalhesTurmaNaPagina();
}

function abrirModalOcorrencia(codigoTurma, alunoNome = "") {
    const modal = document.getElementById("modalOcorrencia");
    const titulo = document.getElementById("modalTituloOcorrencia");
    const campoCodigo = document.getElementById("codigoTurmaOcorrencia");
    const campoAluno = document.getElementById("alunoOcorrencia");
    const nomeAluno = document.getElementById("nomeAlunoOcorrencia");
    const descricao = document.getElementById("descricaoOcorrencia");
    const assistido = document.getElementById("textoAssistido");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (campoCodigo) {
        campoCodigo.value = codigoTurma;
    }

    if (campoAluno) {
        campoAluno.value = alunoNome;
    }

    if (nomeAluno) {
        nomeAluno.value = alunoNome;
    }

    if (titulo) {
        titulo.textContent = alunoNome ? `Registrar ocorrência - ${alunoNome}` : "Registrar ocorrência";
    }

    if (descricao) {
        descricao.value = "";
    }

    if (assistido) {
        assistido.value = "";
    }

    const selectTipo = document.getElementById("tipoOcorrencia");
    if (selectTipo) {
        selectTipo.value = "Pedagógica";
    }

    const botaoGerar = document.getElementById("btnGerarTexto");
    if (botaoGerar) {
        botaoGerar.onclick = gerarSugestaoTexto;
    }

    const botaoSalvar = document.getElementById("salvarOcorrencia");
    if (botaoSalvar) {
        botaoSalvar.onclick = salvarOcorrencia;
    }
}

function fecharModalOcorrencia() {
    const modal = document.getElementById("modalOcorrencia");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }

    document.getElementById("codigoTurmaOcorrencia").value = "";
    document.getElementById("alunoOcorrencia").value = "";
    document.getElementById("nomeAlunoOcorrencia").value = "";
    document.getElementById("descricaoOcorrencia").value = "";
    document.getElementById("textoAssistido").value = "";
}

function gerarSugestaoTexto() {
    const nomeAluno = document.getElementById("nomeAlunoOcorrencia").value.trim() || document.getElementById("alunoOcorrencia").value.trim();
    const tipo = document.getElementById("tipoOcorrencia").value;
    const descricao = document.getElementById("descricaoOcorrencia").value.trim();
    const assistido = document.getElementById("textoAssistido");

    if (assistido) {
        assistido.value = `Ocorrência ${tipo} registrada para ${nomeAluno || "o aluno"}. ${descricao ? "Detalhes: " + descricao : "Descreva o contexto para complementar a situação."}`;
    }
}

function salvarOcorrencia() {
    const codigoTurma = document.getElementById("codigoTurmaOcorrencia").value.trim();
    const nomeAluno = document.getElementById("nomeAlunoOcorrencia").value.trim() || document.getElementById("alunoOcorrencia").value.trim();
    const tipo = document.getElementById("tipoOcorrencia").value;
    const descricao = document.getElementById("descricaoOcorrencia").value.trim();
    const assistido = document.getElementById("textoAssistido").value.trim();

    if (!codigoTurma || !nomeAluno || !descricao) {
        alert("Informe o aluno e a descrição da ocorrência.");
        return;
    }

    const ocorrencias = carregarOcorrenciasDaTurma(codigoTurma);
    const textoFinal = assistido || `Ocorrência ${tipo} registrada para ${nomeAluno}. ${descricao}`;
    ocorrencias.push({ aluno: nomeAluno, tipo, descricao: textoFinal, textoAssistido: assistido });
    salvarOcorrenciasDaTurma(codigoTurma, ocorrencias);
    fecharModalOcorrencia();
    renderizarDetalhesTurmaNaPagina();
}

window.addEventListener("DOMContentLoaded", async () => {
    await inicializarSincronizacaoRemota();
    renderizarPaginaAtual();

    if (document.getElementById("conteudoSeeduc")) {
        mostrarAbaSeeduc("turmas");
    }

    if (window.location.pathname.toLowerCase().includes("saepdetalhes")) {
        renderizarDetalhesSaep();
    }

    const modal = document.getElementById("modalCadastroTurma");
    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                fecharModalCadastro();
            }
        });
    }

    const modalOcorrencia = document.getElementById("modalOcorrencia");
    if (modalOcorrencia) {
        modalOcorrencia.addEventListener("click", (event) => {
            if (event.target === modalOcorrencia) {
                fecharModalOcorrencia();
            }
        });
    }

    const modalConsultaFinalizada = document.getElementById("modalConsultaTurmaFinalizada");
    if (modalConsultaFinalizada) {
        modalConsultaFinalizada.addEventListener("click", (event) => {
            if (event.target === modalConsultaFinalizada) {
                fecharModalConsultaTurmaFinalizada();
            }
        });
    }
});