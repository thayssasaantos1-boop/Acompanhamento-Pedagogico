const STORAGE_KEY = "turmasCadastradas";
const STORAGE_KEY_FINALIZADAS = "turmasFinalizadas";
const STORAGE_KEY_TURMAS_PROJETOS = "turmasProjetos";
const STORAGE_KEY_OCORRENCIAS = "ocorrenciasPedagogicas";
const STORAGE_KEY_OCORRENCIAS_TURMA = "ocorrenciasTurmaPedagogicas";
const STORAGE_KEY_OCORRENCIAS_PROJETOS_TURMA = "ocorrenciasProjetoTurmaPedagogicas";
const STORAGE_KEY_ALUNOS = "alunosPorTurma";
const STORAGE_SYNC_REGISTRY_KEY = "__acompanhamentoSyncRegistry__";
const STORAGE_SYNC_STATIC_KEYS = [
    STORAGE_KEY,
    STORAGE_KEY_FINALIZADAS,
    STORAGE_KEY_TURMAS_PROJETOS,
    "seeducTurmas",
    "seeducRegistros",
    "saepDatas",
    "saepAcoes",
    "saepAvaliacoesObjetivo",
    "saepAvaliacoesPratico",
    "saepSimuladosExcel",
    "saepPlataformasDados",
    "saepHistoricoIndicadores",
    "saepHistoricoEscolar",
    "saepRegistrosGestao",
    "saepMetaNotaPorTurma",
    "saepPlanoAcaoEscola"
];
const STORAGE_SYNC_PREFIXES = [
    `${STORAGE_KEY_ALUNOS}_`,
    `${STORAGE_KEY_OCORRENCIAS}_`,
    `${STORAGE_KEY_OCORRENCIAS_TURMA}_`,
    `${STORAGE_KEY_OCORRENCIAS_PROJETOS_TURMA}_`
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
const SAEP_HISTORICO_ESCOLA_STORAGE_KEY = "saepHistoricoEscolar";
const SAEP_ABA_ATIVA_SESSION_STORAGE = "saepAbaAtivaPorTurma";
const SAEP_HISTORICO_SUBABA_SESSION_STORAGE = "saepHistoricoSubAbaPorTurma";
const SAEP_DIAGNOSTICAS_MANUAIS_STORAGE_KEY = "saepDiagnosticasManuais";
const SAEP_META_NOTA_STORAGE_KEY = "saepMetaNotaPorTurma";
const SAEP_PLANO_ACAO_ESCOLA_STORAGE_KEY = "saepPlanoAcaoEscola";
const SAEP_ALUNOS_OBSERVACOES_STORAGE_KEY = "saepAlunosObservacoes";
const SAEP_SUBMENU_PRINCIPAL_SESSION_STORAGE = "saepSubmenuPrincipalPorTurma";
const SAEP_PAGINA_PRINCIPAL_ABA_STORAGE = "saepPaginaPrincipalAba";
const DIAGNOSTICAS_API_BASE_URL = "http://localhost:3000";
let persistenciaGlobalFormulariosAtiva = false;
let observadorFormulariosPersistencia = null;
let planosResumoSaepPorTurma = {};
const SAEP_RESUMO_DASHBOARD_CACHE_TTL_MS = 45000;
const SAEP_RESUMO_DASHBOARD_CACHE = {};
const GEMINI_KEY_SESSION_STORAGE = "geminiApiKeyOcorrencia";
const GEMINI_KEY_LOCAL_STORAGE = "geminiApiKeyOcorrencia";
const ULTIMA_TURMA_OCORRENCIA_SESSION_STORAGE = "ultimaTurmaOcorrenciaSelecionada";
const ULTIMA_TURMA_OCORRENCIA_PROJETO_SESSION_STORAGE = "ultimaTurmaOcorrenciaProjetoSelecionada";
const OCORRENCIAS_TURMA_ABA_ATIVA_STORAGE = "ocorrenciasTurmaAbaAtiva";
const SAEP_ABAS_OBRIGATORIAS = [
    "D. por Competência - Cruzamento",
    "D. por Competência - Itens",
    "D. por Competência - Detalhes",
    "Desempenho Individual - Detalhe"
];
const FORM_DRAFT_STORAGE_PREFIX = "__formDrafts__";

function salvarDados() {
    // Pega o que o usuario digitou
    const campoEntrada = document.getElementById("menuInput") || document.getElementById("meuInput");
    let informacao = campoEntrada ? campoEntrada.value : "";
    // salva na memória do navegador com o nome 'cadastroUsuario'
    localStorage.setItem("cadastroUsuario", informacao);
}

// Executa automaticamente assim que a página termina de carregar
window.onload = function () {
    let dadosSalvos = localStorage.getItem("cadastroUsuario");
    // se existissem dados salvos antes, coloca eles de volta no campo
    if (dadosSalvos) {
        const campoEntrada = document.getElementById("meuInput") || document.getElementById("menuInput");
        if (campoEntrada) {
            campoEntrada.value = dadosSalvos;
        }
    }
};

function obterChaveRascunhoFormulario(formId) {
    return `${FORM_DRAFT_STORAGE_PREFIX}${formId}`;
}

function persistirDadosLocal(storageKey, dados, opcoes = {}) {
    if (!storageKey) {
        return dados;
    }

    const {
        registrarSync = false,
        salvarSession = false,
        serializar = true
    } = opcoes;

    const valor = serializar ? JSON.stringify(dados) : dados;

    try {
        localStorage.setItem(storageKey, valor);

        if (salvarSession) {
            sessionStorage.setItem(storageKey, valor);
        }

        if (registrarSync) {
            registrarChaveParaSync(storageKey);
            agendarSincronizacaoRemota();
        }
    } catch (error) {
        console.warn(`Não foi possível salvar ${storageKey}:`, error);
    }

    return dados;
}

function salvarRascunhoFormulario(formId, form) {
    if (!formId || !form) {
        return;
    }

    const dados = {};
    form.querySelectorAll("input, textarea, select").forEach((campo) => {
        const chave = campo.id || campo.name;
        if (!chave || campo.type === "file" || campo.disabled || campo.readOnly) {
            return;
        }

        if (campo.type === "checkbox" || campo.type === "radio") {
            dados[chave] = campo.checked;
            return;
        }

        dados[chave] = campo.value;
    });

    persistirDadosLocal(obterChaveRascunhoFormulario(formId), dados);
}

function restaurarRascunhoFormulario(formId, form) {
    if (!formId || !form) {
        return;
    }

    const chave = obterChaveRascunhoFormulario(formId);
    const valor = localStorage.getItem(chave);
    if (!valor) {
        return;
    }

    try {
        const dados = JSON.parse(valor);
        if (!dados || typeof dados !== "object") {
            return;
        }

        form.querySelectorAll("input, textarea, select").forEach((campo) => {
            const chaveCampo = campo.id || campo.name;
            if (!chaveCampo || campo.type === "file" || campo.disabled || campo.readOnly) {
                return;
            }

            if (!(chaveCampo in dados)) {
                return;
            }

            if (campo.type === "checkbox" || campo.type === "radio") {
                campo.checked = Boolean(dados[chaveCampo]);
                return;
            }

            campo.value = dados[chaveCampo];
        });
    } catch (error) {
        console.warn(`Não foi possível restaurar o rascunho do formulário ${formId}:`, error);
    }
}

function limparRascunhoFormulario(formId) {
    if (!formId) {
        return;
    }

    localStorage.removeItem(obterChaveRascunhoFormulario(formId));
}

function invalidarCacheResumoDashboardSaep(codigoTurma = "") {
    if (codigoTurma) {
        delete SAEP_RESUMO_DASHBOARD_CACHE[codigoTurma];
        return;
    }

    Object.keys(SAEP_RESUMO_DASHBOARD_CACHE).forEach((chave) => {
        delete SAEP_RESUMO_DASHBOARD_CACHE[chave];
    });
}

function configurarPersistenciaRascunhoFormulario(formId) {
    const form = document.getElementById(formId);
    if (!form) {
        return;
    }

    if (form.dataset.rascunhoConfigurado === "1") {
        return;
    }

    const salvarAtual = () => salvarRascunhoFormulario(formId, form);

    form.querySelectorAll("input, textarea, select").forEach((campo) => {
        campo.addEventListener("input", salvarAtual);
        campo.addEventListener("change", salvarAtual);
    });

    form.addEventListener("submit", salvarAtual);
    restaurarRascunhoFormulario(formId, form);
    form.dataset.rascunhoConfigurado = "1";
}

function obterValorPersistente(chave) {
    if (!chave) {
        return "";
    }

    return localStorage.getItem(chave) ?? sessionStorage.getItem(chave) ?? "";
}

function salvarValorPersistente(chave, valor) {
    if (!chave) {
        return;
    }

    persistirDadosLocal(chave, valor, { salvarSession: true, serializar: false });
}

function configurarPersistenciaRascunhoTodosFormularios() {
    document.querySelectorAll("form[id]").forEach((form) => {
        if (form.id) {
            configurarPersistenciaRascunhoFormulario(form.id);
        }
    });
}

function salvarRascunhoTodosFormularios() {
    document.querySelectorAll("form[id]").forEach((form) => {
        if (form.id) {
            salvarRascunhoFormulario(form.id, form);
        }
    });
}

function salvarEstadoPersistenteAgora() {
    salvarRascunhoTodosFormularios();

    try {
        persistirDadosLocal("__appState__", {
            pagina: obterNomeDaPagina(),
            pathname: window.location.pathname,
            search: window.location.search,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.warn("Não foi possível salvar o estado global da aplicação:", error);
    }
}

function configurarReforcoPersistenciaGlobal() {
    if (persistenciaGlobalFormulariosAtiva) {
        configurarPersistenciaRascunhoTodosFormularios();
        return;
    }

    persistenciaGlobalFormulariosAtiva = true;
    configurarPersistenciaRascunhoTodosFormularios();

    const salvarTudo = () => salvarEstadoPersistenteAgora();

    window.addEventListener("beforeunload", salvarTudo);
    window.addEventListener("pagehide", salvarTudo);
    window.addEventListener("unload", salvarTudo);
    window.addEventListener("focus", salvarTudo);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            salvarTudo();
        }
    });

    window.setInterval(() => {
        salvarTudo();
    }, 10000);

    if (typeof MutationObserver !== "undefined" && document.body) {
        observadorFormulariosPersistencia = new MutationObserver((mutacoes) => {
            let precisaConfigurar = false;
            mutacoes.forEach((mutacao) => {
                mutacao.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }

                    if (node.matches?.("form[id]") || node.querySelector?.("form[id]")) {
                        precisaConfigurar = true;
                    }
                });
            });

            if (precisaConfigurar) {
                configurarPersistenciaRascunhoTodosFormularios();
            }
        });

        observadorFormulariosPersistencia.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

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

    const serialRemoto = JSON.stringify(payload.keys);
    const serialLocal = JSON.stringify(obterPayloadSyncLocal().keys);

    if (serialRemoto === serialLocal) {
        APP_SYNC_STATE.lastSerializedPayload = serialLocal;
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

function obterAbaSaepDetalhesAtivaNaInterface() {
    const botaoAtivo = document.querySelector(".saep-sidebar__item.active");
    return String(botaoAtivo?.dataset?.aba || "").trim().toLowerCase();
}

function modalDiagnosticaAberta() {
    const modal = document.getElementById("modalCadastroDiagnostica");
    if (!modal) {
        return false;
    }

    return modal.classList.contains("active") || modal.getAttribute("aria-hidden") === "false";
}

function deveAdiarAtualizacaoSaepDiagnosticas() {
    if (!window.location.pathname.toLowerCase().includes("saepdetalhes")) {
        return false;
    }

    const abaAtiva = obterAbaSaepDetalhesAtivaNaInterface();
    if (abaAtiva !== "diagnosticas") {
        return false;
    }

    if (modalDiagnosticaAberta()) {
        return true;
    }

    const foco = document.activeElement;
    const secaoDiagnosticas = document.getElementById("saepSectionDiagnosticas");
    if (foco && secaoDiagnosticas && secaoDiagnosticas.contains(foco)) {
        return true;
    }

    return true;
}

function atualizarSaepDetalhesAposSyncRemoto() {
    if (!window.location.pathname.toLowerCase().includes("saepdetalhes")) {
        return;
    }

    if (deveAdiarAtualizacaoSaepDiagnosticas()) {
        return;
    }

    renderizarDetalhesSaep();
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
                atualizarSaepDetalhesAposSyncRemoto();
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
        const chaveRascunho = obterChaveRascunhoFormulario("formCadastroTurma");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            form.reset();
        } else {
            restaurarRascunhoFormulario("formCadastroTurma", form);
        }

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

function abrirModalCadastroTurmaProjeto() {
    const modal = document.getElementById("modalCadastroTurmaProjeto");
    const form = document.getElementById("formCadastroTurmaProjeto");
    const titulo = document.getElementById("modalTituloTurmaProjeto");
    const botaoSalvar = document.getElementById("btnSalvarTurmaProjeto");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        const chaveRascunho = obterChaveRascunhoFormulario("formCadastroTurmaProjeto");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            form.reset();
        } else {
            restaurarRascunhoFormulario("formCadastroTurmaProjeto", form);
        }

        const indice = document.getElementById("indiceTurmaProjetoEdicao");
        if (indice) {
            indice.value = "";
        }
    }

    if (titulo) {
        titulo.textContent = "Cadastrar turma com projeto";
    }

    if (botaoSalvar) {
        botaoSalvar.textContent = "Cadastrar";
    }
}

function abrirModalEdicaoTurmaProjeto(index) {
    const turmas = carregarTurmasDoStorage(STORAGE_KEY_TURMAS_PROJETOS);
    const turma = turmas[index];

    if (!turma) {
        return;
    }

    document.getElementById("codigoTurmaProjeto").value = turma.codigoTurma || "";
    document.getElementById("nomeReduzidoProjeto").value = turma.nomeReduzido || "";
    document.getElementById("cursoProjeto").value = turma.curso || "";
    document.getElementById("projeto").value = turma.projeto || "";
    document.getElementById("dataInicioProjeto").value = turma.dataInicio || "";
    document.getElementById("dataFimProjeto").value = turma.dataFim || "";
    document.getElementById("instrutorProjeto").value = turma.instrutor || "";
    document.getElementById("indiceTurmaProjetoEdicao").value = index;

    const modal = document.getElementById("modalCadastroTurmaProjeto");
    const titulo = document.getElementById("modalTituloTurmaProjeto");
    const botaoSalvar = document.getElementById("btnSalvarTurmaProjeto");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (titulo) {
        titulo.textContent = "Editar turma com projeto";
    }

    if (botaoSalvar) {
        botaoSalvar.textContent = "Salvar alterações";
    }
}

function fecharModalCadastroTurmaProjeto() {
    const modal = document.getElementById("modalCadastroTurmaProjeto");
    const form = document.getElementById("formCadastroTurmaProjeto");

    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }

    if (form) {
        form.reset();
        const indice = document.getElementById("indiceTurmaProjetoEdicao");
        if (indice) {
            indice.value = "";
        }
    }

    const titulo = document.getElementById("modalTituloTurmaProjeto");
    const botaoSalvar = document.getElementById("btnSalvarTurmaProjeto");

    if (titulo) {
        titulo.textContent = "Cadastrar turma com projeto";
    }

    if (botaoSalvar) {
        botaoSalvar.textContent = "Cadastrar";
    }
}

function salvarTurmasProjetos(event) {
    event.preventDefault();

    const turma = {
        codigoTurma: document.getElementById("codigoTurmaProjeto").value.trim(),
        nomeReduzido: document.getElementById("nomeReduzidoProjeto").value.trim(),
        curso: document.getElementById("cursoProjeto").value.trim(),
        projeto: document.getElementById("projeto").value.trim(),
        dataInicio: document.getElementById("dataInicioProjeto").value,
        dataFim: document.getElementById("dataFimProjeto").value,
        instrutor: document.getElementById("instrutorProjeto").value.trim()
    };

    if (!turma.codigoTurma || !turma.nomeReduzido || !turma.curso || !turma.projeto || !turma.dataInicio || !turma.dataFim || !turma.instrutor) {
        alert("Preencha todos os campos para cadastrar a turma com projeto.");
        return;
    }

    const turmasSalvas = carregarTurmasDoStorage(STORAGE_KEY_TURMAS_PROJETOS);
    const indiceEdicao = document.getElementById("indiceTurmaProjetoEdicao").value;

    if (indiceEdicao !== "") {
        turmasSalvas[parseInt(indiceEdicao, 10)] = turma;
    } else {
        turmasSalvas.push(turma);
    }

    salvarTurmasNoStorage(turmasSalvas, STORAGE_KEY_TURMAS_PROJETOS);
    limparRascunhoFormulario("formCadastroTurmaProjeto");
    salvarEstadoPersistenteAgora();
    renderizarPaginaAtual();
    fecharModalCadastroTurmaProjeto();
}

function salvarTurmasNoStorage(turmas, storageKey = STORAGE_KEY) {
    return persistirDadosLocal(storageKey, turmas, { registrarSync: true });
}

function carregarTurmasDoStorage(storageKey = STORAGE_KEY) {
    const dados = localStorage.getItem(storageKey);
    if (!dados) {
        return [];
    }

    try {
        const valor = JSON.parse(dados);
        if (Array.isArray(valor)) {
            return valor;
        }

        if (valor && typeof valor === "object") {
            return [valor];
        }

        return [];
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

        dados.forEach((valor, indiceValor) => {
            const celula = document.createElement("td");
            if (indiceValor === 0) {
                const botaoCodigo = document.createElement("button");
                botaoCodigo.type = "button";
                botaoCodigo.className = "link-button";
                botaoCodigo.textContent = valor;
                botaoCodigo.addEventListener("click", () => abrirPaginaDetalhesTurmaProjeto(turma.codigoTurma));
                celula.appendChild(botaoCodigo);
            } else {
                celula.textContent = valor;
            }
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

function renderizarTabelaTurmasProjetos(turmas, containerId = "corpotablecadastrodeTurmasProjetos") {
    const tabela = document.getElementById(containerId);
    if (!tabela) {
        return;
    }

    tabela.innerHTML = "";

    if (!Array.isArray(turmas) || turmas.length === 0) {
        const linhaVazia = document.createElement("tr");
        const celulaVazia = document.createElement("td");
        celulaVazia.colSpan = 8;
        celulaVazia.textContent = "Nenhuma turma com projeto cadastrada.";
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
            turma.projeto,
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
        const botaoEditar = criarBotaoAcao("✏️", "btn-edit", () => abrirModalEdicaoTurmaProjeto(index));
        const botaoExcluir = criarBotaoAcao("🗑️", "btn-delete", () => excluirTurmaProjeto(index));
        const botaoFinalizar = criarBotaoAcao("✔️", "btn-finish", () => finalizarTurmaProjeto(index));
        const botaoOcorrencias = criarBotaoAcao("Ocorrências", "btn-secondary", () => abrirPaginaDetalhesTurmaProjeto(turma.codigoTurma));

        celulaAcoes.appendChild(botaoEditar);
        celulaAcoes.appendChild(botaoExcluir);
        celulaAcoes.appendChild(botaoFinalizar);
        celulaAcoes.appendChild(botaoOcorrencias);
        linha.appendChild(celulaAcoes);

        tabela.appendChild(linha);
    });
}

function excluirTurmaProjeto(index) {
    const turmas = carregarTurmasDoStorage(STORAGE_KEY_TURMAS_PROJETOS);
    if (!turmas[index]) {
        return;
    }

    const confirmacao = window.confirm("Deseja realmente excluir esta turma com projeto?");
    if (!confirmacao) {
        return;
    }

    turmas.splice(index, 1);
    salvarTurmasNoStorage(turmas, STORAGE_KEY_TURMAS_PROJETOS);
    renderizarPaginaAtual();
}

function abrirPaginaDetalhesTurmaProjeto(codigoTurma) {
    window.location.href = `TurmasProjetosDetalhes.html?turma=${encodeURIComponent(codigoTurma)}`;
}

function obterTurmaProjetoPorCodigo(codigoTurma) {
    return carregarTurmasDoStorage(STORAGE_KEY_TURMAS_PROJETOS).find((item) => item.codigoTurma === codigoTurma) || null;
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
    salvarEstadoPersistenteAgora();
    renderizarPaginaAtual();

    window.setTimeout(() => {
        window.location.href = "TurmasFinalizadas.html";
    }, 120);
}

function finalizarTurmaProjeto(index) {
    const turmasProjetos = carregarTurmasDoStorage(STORAGE_KEY_TURMAS_PROJETOS);
    const turma = turmasProjetos[index];
    if (!turma) {
        return;
    }

    const confirmacao = window.confirm("Deseja finalizar esta turma com projeto e movê-la para a página de finalizadas?");
    if (!confirmacao) {
        return;
    }

    const turmasFinalizadas = carregarTurmasDoStorage(STORAGE_KEY_FINALIZADAS);
    turmasProjetos.splice(index, 1);
    turmasFinalizadas.push(turma);

    salvarTurmasNoStorage(turmasProjetos, STORAGE_KEY_TURMAS_PROJETOS);
    salvarTurmasNoStorage(turmasFinalizadas, STORAGE_KEY_FINALIZADAS);
    salvarEstadoPersistenteAgora();
    renderizarPaginaAtual();

    window.setTimeout(() => {
        window.location.href = "TurmasFinalizadas.html";
    }, 120);
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
                    <label>Prova Prática<input type="text" value="${formatarPeriodoPraticoSaepTexto(dados.datas)}" readonly disabled></label>
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

    if (pagina.includes("turmasprojetosdetalhes")) {
        renderizarDetalhesTurmaProjetoNaPagina();
        return;
    }

    if (pagina.includes("turmasprojetos")) {
        renderizarTabelaTurmasProjetos(carregarTurmasDoStorage(STORAGE_KEY_TURMAS_PROJETOS), "corpotablecadastrodeTurmasProjetos");
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
    limparRascunhoFormulario("formCadastroTurma");
    salvarEstadoPersistenteAgora();
    renderizarPaginaAtual();
    fecharModalCadastro();
}

function obterChaveAlunosTurma(codigoTurma) {
    return `${STORAGE_KEY_ALUNOS}_${codigoTurma}`;
}

function obterChaveOcorrenciasTurma(codigoTurma) {
    return `${STORAGE_KEY_OCORRENCIAS}_${codigoTurma}`;
}

function obterChaveOcorrenciasGeraisTurma(codigoTurma) {
    return `${STORAGE_KEY_OCORRENCIAS_TURMA}_${codigoTurma}`;
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

    return ocorrencias.map((item, index) => {
        if (typeof item === "string") {
            return {
                id: item?.id || `${codigoTurma}-${index + 1}`,
                aluno: item,
                tipo: "Pedagógica",
                descricao: item,
                textoAssistido: ""
            };
        }

        return {
            id: item?.id || `${codigoTurma}-${index + 1}`,
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

function carregarOcorrenciasGeraisDaTurma(codigoTurma) {
    const ocorrencias = carregarTurmasDoStorage(obterChaveOcorrenciasGeraisTurma(codigoTurma));
    if (!Array.isArray(ocorrencias)) {
        return [];
    }

    return ocorrencias.map((item, index) => ({
        id: item?.id || `${codigoTurma}-turma-${index + 1}`,
        data: item?.data || "",
        tipo: item?.tipo || "Pedagógica",
        descricao: item?.descricao || ""
    }));
}

function salvarOcorrenciasGeraisDaTurma(codigoTurma, ocorrencias) {
    salvarTurmasNoStorage(ocorrencias, obterChaveOcorrenciasGeraisTurma(codigoTurma));
}

function obterMapaAbasOcorrenciasTurma() {
    const dados = carregarTurmasDoStorage(OCORRENCIAS_TURMA_ABA_ATIVA_STORAGE);
    if (!dados || Array.isArray(dados) || typeof dados !== "object") {
        return {};
    }

    return dados;
}

function salvarAbaOcorrenciasTurma(codigoTurma, aba) {
    const mapa = obterMapaAbasOcorrenciasTurma();
    mapa[codigoTurma] = aba;
    salvarTurmasNoStorage(mapa, OCORRENCIAS_TURMA_ABA_ATIVA_STORAGE);
}

function obterAbaOcorrenciasTurma(codigoTurma) {
    const mapa = obterMapaAbasOcorrenciasTurma();
    return mapa[codigoTurma] || "alunos";
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
        const chaveRascunho = obterChaveRascunhoFormulario("formCadastroSeeduc");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            form.reset();
        } else {
            restaurarRascunhoFormulario("formCadastroSeeduc", form);
        }
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
    limparRascunhoFormulario("formCadastroSeeduc");
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

function obterPeriodoPraticoSaep(registro = {}) {
    if (registro.saepPraticoInicio || registro.saepPraticoFim) {
        return {
            inicio: registro.saepPraticoInicio || "",
            fim: registro.saepPraticoFim || ""
        };
    }

    const valor = registro.saepPratico || "";
    if (!valor) {
        return { inicio: "", fim: "" };
    }

    if (valor.includes(" a ")) {
        const [inicio, fim] = valor.split(" a ");
        return { inicio: inicio.trim(), fim: fim.trim() };
    }

    return { inicio: valor, fim: valor };
}

function formatarPeriodoPraticoSaepTexto(registro = {}) {
    const { inicio, fim } = obterPeriodoPraticoSaep(registro);

    if (!inicio && !fim) {
        return "-";
    }

    if (inicio && fim) {
        return `${formatarDataParaExibir(inicio)} a ${formatarDataParaExibir(fim)}`;
    }

    return formatarDataParaExibir(inicio || fim);
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
        const chaveRascunho = obterChaveRascunhoFormulario("formCadastroSaep");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            form.reset();
        } else {
            restaurarRascunhoFormulario("formCadastroSaep", form);
        }
    }

    const dados = carregarTurmasDoStorage("saepDatas") || [];
    const registro = dados.find((item) => item.codigoTurma === codigoTurma);

    if (registro) {
        const objetivo = document.getElementById("dataSaepObjetivo");
        const praticoInicio = document.getElementById("dataSaepPraticoInicio");
        const praticoFim = document.getElementById("dataSaepPraticoFim");
        const { inicio, fim } = obterPeriodoPraticoSaep(registro);

        if (objetivo) {
            objetivo.value = registro.saepObjetivo || "";
        }

        if (praticoInicio) {
            praticoInicio.value = inicio;
        }

        if (praticoFim) {
            praticoFim.value = fim;
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
    const saepPraticoInicio = document.getElementById("dataSaepPraticoInicio").value;
    const saepPraticoFim = document.getElementById("dataSaepPraticoFim").value;

    if (!codigoTurma) {
        alert("Selecione uma turma antes de salvar.");
        return;
    }

    const dados = carregarTurmasDoStorage("saepDatas") || [];
    const indice = dados.findIndex((item) => item.codigoTurma === codigoTurma);
    const registro = {
        codigoTurma,
        saepObjetivo,
        saepPraticoInicio,
        saepPraticoFim,
        saepPratico: saepPraticoInicio && saepPraticoFim
            ? `${saepPraticoInicio} a ${saepPraticoFim}`
            : saepPraticoInicio || saepPraticoFim || ""
    };

    if (indice >= 0) {
        dados[indice] = registro;
    } else {
        dados.push(registro);
    }

    salvarTurmasNoStorage(dados, "saepDatas");
    limparRascunhoFormulario("formCadastroSaep");
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
    const ordenados = (informativos || []).slice().sort((a, b) => new Date(b.dataPublicacao || b.criadoEm) - new Date(a.dataPublicacao || a.criadoEm));

    if (ordenados.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Nenhum informativo cadastrado para esta turma.</div>';
        return;
    }

    container.innerHTML = `
        <div class="saep-mural-grid">
            ${ordenados.map((item) => `
                <article class="saep-mural-card">
                    <div class="saep-mural-card__head">
                        <div>
                            <strong>${item.titulo || "Informativo"}</strong>
                            <div class="saep-muted">${item.dataPublicacao ? new Date(item.dataPublicacao).toLocaleDateString("pt-BR") : new Date(item.criadoEm).toLocaleDateString("pt-BR")}</div>
                        </div>
                        <span class="saep-badge">${item.dataPublicacao ? new Date(item.dataPublicacao).toLocaleDateString("pt-BR") : "Novo"}</span>
                    </div>
                    <p>${(item.texto || "").replace(/\n/g, "<br>").slice(0, 160)}${(item.texto || "").length > 160 ? "..." : ""}</p>
                    <div class="saep-mural-card__actions">
                        <button type="button" class="btn-secondary saep-inline-btn" data-editar-informativo="${item.id}">Editar</button>
                        <button type="button" class="btn-delete saep-inline-danger" data-excluir-informativo="${item.id}">Excluir</button>
                    </div>
                </article>
            `).join("")}
        </div>
    `;

    container.querySelectorAll("[data-editar-informativo]").forEach((botao) => {
        botao.onclick = () => {
            const informativoId = botao.getAttribute("data-editar-informativo");
            const informativo = ordenados.find((item) => item.id === informativoId);
            if (!informativo) {
                return;
            }

            document.getElementById("informativoIdPlataforma").value = informativo.id;
            document.getElementById("tituloModalInformativoPlataforma").textContent = "Editar Informativo";
            document.getElementById("informativoTituloPlataforma").value = informativo.titulo || "";
            document.getElementById("informativoDataPublicacaoPlataforma").value = informativo.dataPublicacao || "";
            document.getElementById("informativoPlataformaTexto").value = informativo.texto || "";
            abrirModalPlataforma("modalInformativoPlataforma");
        };
    });

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
    const etapasOrdenadas = (etapas || []).slice().sort((a, b) => new Date(a.dataInicio || 0) - new Date(b.dataInicio || 0));

    container.innerHTML = `
        <div class="table-scroll">
            <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                <thead>
                    <tr>
                        <th>Início</th>
                        <th>Fim</th>
                        <th>Ação</th>
                        <th>Status</th>
                        <th>Ações</th>
                        <th>Observações</th>
                    </tr>
                </thead>
                <tbody>
                    ${etapasOrdenadas.length === 0
        ? '<tr><td colspan="6">Nenhuma etapa cadastrada.</td></tr>'
        : etapasOrdenadas.map((item) => `
                        <tr>
                            <td>${formatarDataParaExibirSaep(item.dataInicio)}</td>
                            <td>${formatarDataParaExibirSaep(item.dataFim)}</td>
                            <td>${item.acao || "-"}</td>
                            <td>${item.status || "-"}</td>
                            <td>
                                <button type="button" class="btn-secondary saep-inline-btn" data-editar-etapa="${item.id}">Editar</button>
                                <button type="button" class="btn-delete saep-inline-danger" data-excluir-etapa="${item.id}" title="Excluir etapa">Excluir</button>
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
            const etapa = etapasOrdenadas.find((item) => item.id === etapaId);
            if (!etapa) {
                return;
            }

            document.getElementById("etapaAcessoId").value = etapa.id;
            document.getElementById("etapaDataInicio").value = etapa.dataInicio;
            document.getElementById("etapaDataFim").value = etapa.dataFim;
            document.getElementById("etapaAcao").value = etapa.acao;
            document.getElementById("etapaStatus").value = etapa.status || "Iniciar";
            document.getElementById("tituloModalEtapasAcesso").textContent = "Editar Etapa do Processo";
            abrirModalPlataforma("modalEtapasAcesso");
        };
    });

    container.querySelectorAll("[data-observacao-etapa]").forEach((botao) => {
        botao.onclick = () => {
            const etapaId = botao.getAttribute("data-observacao-etapa");
            const etapa = etapasOrdenadas.find((item) => item.id === etapaId);
            if (!etapa) {
                return;
            }

            abrirModalObservacaoEtapa(codigoTurma, etapa);
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

function abrirModalObservacaoEtapa(codigoTurma, etapa) {
    const modal = document.getElementById("modalObservacaoEtapa");
    const campoId = document.getElementById("observacaoEtapaId");
    const campoTexto = document.getElementById("observacaoEtapaTexto");
    const form = document.getElementById("formObservacaoEtapa");
    const botaoCancelar = document.getElementById("btnCancelarObservacaoEtapa");

    if (!modal || !campoId || !campoTexto || !form || !botaoCancelar) {
        return;
    }

    campoId.value = etapa.id;
    campoTexto.value = etapa.observacoes || "";

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    botaoCancelar.onclick = () => fecharModalObservacaoEtapa();
    modal.onclick = (event) => {
        if (event.target === modal) {
            fecharModalObservacaoEtapa();
        }
    };

    form.onsubmit = (event) => {
        event.preventDefault();

        const etapaId = campoId.value;
        const texto = campoTexto.value.trim();
        atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => ({
            ...dadosTurma,
            etapas: dadosTurma.etapas.map((item) => item.id === etapaId ? { ...item, observacoes: texto } : item)
        }));

        fecharModalObservacaoEtapa();
        renderizarTabelaEtapasAcesso(codigoTurma);
    };
}

function fecharModalObservacaoEtapa() {
    const modal = document.getElementById("modalObservacaoEtapa");
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function configurarPlataformasSaep(codigoTurma, instrutorPadrao) {
    const botaoInformativo = document.getElementById("btnCadastrarInformativos");
    const botaoDatasSaep = document.getElementById("btnCadastrarDatasSaepPlataforma");
    const botaoEtapas = document.getElementById("btnCadastrarEtapasAcesso");
    const formInformativo = document.getElementById("formInformativoPlataforma");
    const modalInformativo = document.getElementById("modalInformativoPlataforma");
    const formDatas = document.getElementById("formDatasSaepPlataforma");
    const formEtapas = document.getElementById("formEtapasAcesso");
    const selectTipoProva = document.getElementById("tipoProvaSaepPlataforma");
    const inputCodigoTurma = document.getElementById("codigoTurmaPlataforma");
    const inputInstrutor = document.getElementById("instrutorPlataforma");
    const modalDatas = document.getElementById("modalDatasSaepPlataforma");
    const modalEtapas = document.getElementById("modalEtapasAcesso");

    if (!botaoInformativo || !formInformativo || !modalInformativo) {
        return;
    }

    renderizarMuralPlataformas(codigoTurma);

    botaoInformativo.onclick = () => {
        const chaveRascunho = obterChaveRascunhoFormulario("formInformativoPlataforma");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            formInformativo.reset();
        } else {
            restaurarRascunhoFormulario("formInformativoPlataforma", formInformativo);
        }

        abrirModalPlataforma("modalInformativoPlataforma");
    };

    document.getElementById("btnCancelarInformativoPlataforma").onclick = () => fecharModalPlataforma("modalInformativoPlataforma");

    formInformativo.onsubmit = (event) => {
        event.preventDefault();
        const titulo = document.getElementById("informativoTituloPlataforma").value.trim();
        const texto = document.getElementById("informativoPlataformaTexto").value.trim();
        const dataPublicacao = document.getElementById("informativoDataPublicacaoPlataforma").value;
        const informativoId = document.getElementById("informativoIdPlataforma").value;

        if (!titulo || !texto || !dataPublicacao) {
            alert("Preencha título, texto e data de publicação.");
            return;
        }

        atualizarDadosPlataformasTurma(codigoTurma, (dadosTurma) => {
            const lista = [...dadosTurma.informativos];
            const payload = {
                id: informativoId || `${Date.now()}`,
                titulo,
                texto,
                dataPublicacao,
                criadoEm: new Date().toISOString()
            };

            if (informativoId) {
                const indice = lista.findIndex((item) => item.id === informativoId);
                if (indice >= 0) {
                    lista[indice] = { ...lista[indice], ...payload };
                }
            } else {
                lista.push(payload);
            }

            return {
                ...dadosTurma,
                informativos: lista
            };
        });

        formInformativo.reset();
        document.getElementById("informativoIdPlataforma").value = "";
        document.getElementById("tituloModalInformativoPlataforma").textContent = "Novo Informativo";
        fecharModalPlataforma("modalInformativoPlataforma");
        renderizarMuralPlataformas(codigoTurma);
    };

    if (botaoDatasSaep && formDatas && selectTipoProva && inputCodigoTurma && inputInstrutor && modalDatas) {
        botaoDatasSaep.onclick = () => {
            const chaveRascunho = obterChaveRascunhoFormulario("formDatasSaepPlataforma");
            const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

            if (!temRascunho) {
                formDatas.reset();
                inputCodigoTurma.value = codigoTurma;
                inputInstrutor.value = instrutorPadrao || "";
                selectTipoProva.value = "objetiva";
                atualizarCamposTipoProvaPlataforma();
            } else {
                restaurarRascunhoFormulario("formDatasSaepPlataforma", formDatas);
            }

            abrirModalPlataforma("modalDatasSaepPlataforma");
        };

        const botaoCancelarDatas = document.getElementById("btnCancelarDatasSaepPlataforma");
        if (botaoCancelarDatas) {
            botaoCancelarDatas.onclick = () => fecharModalPlataforma("modalDatasSaepPlataforma");
        }

        selectTipoProva.onchange = atualizarCamposTipoProvaPlataforma;

        formDatas.onsubmit = (event) => {
            event.preventDefault();

            const tipo = selectTipoProva.value;
            const codigoTurmaInformado = inputCodigoTurma.value.trim();
            const instrutor = inputInstrutor.value.trim();
            const dataObjetiva = document.getElementById("dataObjetivaPlataforma")?.value;
            const dataPraticaInicio = document.getElementById("dataPraticaInicioPlataforma")?.value;
            const dataPraticaFim = document.getElementById("dataPraticaFimPlataforma")?.value;

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
    }

    if (botaoEtapas && formEtapas && modalEtapas) {
        botaoEtapas.onclick = () => {
            const chaveRascunho = obterChaveRascunhoFormulario("formEtapasAcesso");
            const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

            if (!temRascunho) {
                formEtapas.reset();
                const campoEtapaId = document.getElementById("etapaAcessoId");
                if (campoEtapaId) {
                    campoEtapaId.value = "";
                }
                const tituloEtapas = document.getElementById("tituloModalEtapasAcesso");
                if (tituloEtapas) {
                    tituloEtapas.textContent = "Cadastrar Etapas de Acesso";
                }
            } else {
                restaurarRascunhoFormulario("formEtapasAcesso", formEtapas);
            }

            abrirModalPlataforma("modalEtapasAcesso");
        };

        const botaoCancelarEtapas = document.getElementById("btnCancelarEtapasAcesso");
        if (botaoCancelarEtapas) {
            botaoCancelarEtapas.onclick = () => fecharModalPlataforma("modalEtapasAcesso");
        }

        formEtapas.onsubmit = (event) => {
            event.preventDefault();

            const etapaId = document.getElementById("etapaAcessoId")?.value || "";
            const dataInicio = document.getElementById("etapaDataInicio")?.value;
            const dataFim = document.getElementById("etapaDataFim")?.value;
            const acao = document.getElementById("etapaAcao")?.value?.trim();
            const status = document.getElementById("etapaStatus")?.value;

            if (!dataInicio || !dataFim || !acao || !status) {
                alert("Preencha todos os campos da etapa.");
                return;
            }

            if (new Date(dataFim) < new Date(dataInicio)) {
                alert("A data de fim deve ser maior ou igual à data de início.");
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

            formEtapas.reset();
            const campoEtapaId = document.getElementById("etapaAcessoId");
            if (campoEtapaId) {
                campoEtapaId.value = "";
            }
            const tituloEtapas = document.getElementById("tituloModalEtapasAcesso");
            if (tituloEtapas) {
                tituloEtapas.textContent = "Cadastrar Etapa do Processo";
            }
            fecharModalPlataforma("modalEtapasAcesso");
            renderizarTabelaEtapasAcesso(codigoTurma);
        };
    }

    modalInformativo.onclick = (event) => {
        if (event.target === modalInformativo) {
            fecharModalPlataforma("modalInformativoPlataforma");
        }
    };

    if (modalDatas) {
        modalDatas.onclick = (event) => {
            if (event.target === modalDatas) {
                fecharModalPlataforma("modalDatasSaepPlataforma");
            }
        };
    }

    if (modalEtapas) {
        modalEtapas.onclick = (event) => {
            if (event.target === modalEtapas) {
                fecharModalPlataforma("modalEtapasAcesso");
            }
        };
    }
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
        container.innerHTML = '<div class="saep-empty-state">Nenhuma avaliação importada para esta turma.</div>';
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
    const codigoTurma = new URLSearchParams(window.location.search).get("turma") || "";
    const abasPrincipais = new Set(["resumo", "diagnosticas", "plano", "praticos", "saep"]);
    const abaNormalizada = aba === "historico" || aba === "plataformas"
        ? "saep"
        : (abasPrincipais.has(aba) ? aba : "resumo");

    secoes.forEach((secao) => {
        secao.style.display = "none";
    });

    const secaoAlvo = document.getElementById(`saepSection${abaNormalizada.charAt(0).toUpperCase() + abaNormalizada.slice(1)}`);
    if (secaoAlvo) {
        secaoAlvo.style.display = "block";
    }

    if (codigoTurma && abaNormalizada) {
        salvarAbaAtivaSaep(codigoTurma, abaNormalizada);
    }

    if (abaNormalizada === "resumo") {
        if (codigoTurma) {
            renderizarResumoPedagogicoSaep(codigoTurma);
        }
    }

    if (abaNormalizada === "diagnosticas" && codigoTurma) {
        renderizarAvaliacoesDiagnosticas(codigoTurma);
    }

    if (abaNormalizada === "alunos" && codigoTurma) {
        renderizarAlunosDiagnosticaSaep(codigoTurma);
    }

    if (abaNormalizada === "saep" && codigoTurma) {
        const submenuSaep = aba === "plataformas" || aba === "historico"
            ? aba
            : obterSubmenuPrincipalSaep(codigoTurma);
        mostrarSubmenuSaepDetalhes(submenuSaep, codigoTurma);
    }

    botoesSidebar.forEach((item) => {
        item.classList.toggle("active", item.dataset.aba === abaNormalizada);
    });
}

function carregarMapaAbasSaep() {
    const dados = obterValorPersistente(SAEP_ABA_ATIVA_SESSION_STORAGE);
    if (!dados) {
        return {};
    }

    try {
        const parsed = JSON.parse(dados);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function salvarAbaAtivaSaep(codigoTurma, aba) {
    const mapa = carregarMapaAbasSaep();
    mapa[codigoTurma] = aba;
    salvarValorPersistente(SAEP_ABA_ATIVA_SESSION_STORAGE, JSON.stringify(mapa));
}

function obterAbaAtivaSaep(codigoTurma) {
    const mapa = carregarMapaAbasSaep();
    const abaSalva = mapa[codigoTurma] || "resumo";
    const abasValidas = new Set(["resumo", "diagnosticas", "plano", "praticos", "saep"]);

    if (abaSalva === "historico" || abaSalva === "plataformas") {
        return "saep";
    }

    if (abaSalva === "objetivos" || abaSalva === "alunos") {
        return "resumo";
    }

    return abasValidas.has(abaSalva) ? abaSalva : "resumo";
}

function carregarMapaSubAbasHistoricoSaep() {
    const dados = obterValorPersistente(SAEP_HISTORICO_SUBABA_SESSION_STORAGE);
    if (!dados) {
        return {};
    }

    try {
        const parsed = JSON.parse(dados);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function salvarSubAbaHistoricoSaep(codigoTurma, subAba) {
    const mapa = carregarMapaSubAbasHistoricoSaep();
    mapa[codigoTurma] = subAba;
    salvarValorPersistente(SAEP_HISTORICO_SUBABA_SESSION_STORAGE, JSON.stringify(mapa));
}

function obterSubAbaHistoricoSaep(codigoTurma) {
    const mapa = carregarMapaSubAbasHistoricoSaep();
    return mapa[codigoTurma] || "saep";
}

function carregarMapaSubmenuPrincipalSaep() {
    const dados = obterValorPersistente(SAEP_SUBMENU_PRINCIPAL_SESSION_STORAGE);
    if (!dados) {
        return {};
    }

    try {
        const parsed = JSON.parse(dados);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function salvarSubmenuPrincipalSaep(codigoTurma, submenu) {
    if (!codigoTurma || !submenu) {
        return;
    }

    const mapa = carregarMapaSubmenuPrincipalSaep();
    mapa[codigoTurma] = submenu;
    salvarValorPersistente(SAEP_SUBMENU_PRINCIPAL_SESSION_STORAGE, JSON.stringify(mapa));
}

function obterSubmenuPrincipalSaep(codigoTurma) {
    const mapa = carregarMapaSubmenuPrincipalSaep();
    return mapa[codigoTurma] || "historico";
}

function mostrarSubmenuSaepDetalhes(submenu, codigoTurmaParam = "") {
    const codigoTurma = codigoTurmaParam || new URLSearchParams(window.location.search).get("turma") || "";
    const submenuNormalizado = submenu === "plataformas" ? "plataformas" : "historico";
    const botoes = document.querySelectorAll("#saepSubmenuPrincipal .seeduc-submenu__item");
    const painelHistorico = document.getElementById("saepSubmenuHistorico");
    const painelPlataformas = document.getElementById("saepSubmenuPlataformas");

    botoes.forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.submenu === submenuNormalizado);
    });

    if (painelHistorico) {
        painelHistorico.style.display = submenuNormalizado === "historico" ? "block" : "none";
    }

    if (painelPlataformas) {
        painelPlataformas.style.display = submenuNormalizado === "plataformas" ? "block" : "none";
    }

    if (codigoTurma) {
        salvarSubmenuPrincipalSaep(codigoTurma, submenuNormalizado);
    }
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
    const analise = gerarAnaliseImportacaoSaep({ cruzamento, itens, detalhes, individual });
    const importacaoId = `${Date.now()}`;
    const registrosImportados = gerarRegistrosImportacaoSaep(codigoTurma, { cruzamento, itens, detalhes, individual }, importacaoId);

    limparRegistrosImportadosSaep(codigoTurma);
    salvarRegistrosImportadosSaep(codigoTurma, registrosImportados);

    historicoTurma.push({
        id: importacaoId,
        codigoTurma,
        nomeArquivo: arquivo.name,
        importadoEm: new Date().toISOString(),
        resumo: {
            cruzamento: cruzamento.length,
            itens: itens.length,
            detalhes: detalhes.length,
            individual: individual.length
        },
        analise,
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

function normalizarTextoSaep(valor) {
    return String(valor ?? "").trim();
}

function ehNumeroSaep(valor) {
    const texto = normalizarTextoSaep(valor).replace(",", ".");
    return texto !== "" && !Number.isNaN(Number(texto));
}

function converterNumeroSaep(valor) {
    if (!ehNumeroSaep(valor)) {
        return null;
    }

    const numero = Number(String(valor).replace(",", "."));
    return Number.isFinite(numero) ? numero : null;
}

function obterValorPorPadroesSaep(linha, padroes) {
    if (!linha || typeof linha !== "object") {
        return "";
    }

    for (const [chave, valor] of Object.entries(linha)) {
        if (padroes.some((padrao) => padrao.test(chave)) && normalizarTextoSaep(valor)) {
            return normalizarTextoSaep(valor);
        }
    }

    return "";
}

function extrairNumeroDaLinhaSaep(linha, padroes = []) {
    if (!linha || typeof linha !== "object") {
        return null;
    }

    for (const [chave, valor] of Object.entries(linha)) {
        const numero = converterNumeroSaep(valor);
        if (numero !== null && (padroes.length === 0 || padroes.some((padrao) => padrao.test(chave)))) {
            return numero;
        }
    }

    return null;
}

function extrairNomeAlunoSaep(linha) {
    return obterValorPorPadroesSaep(linha, [/^aluno$/i, /^nome$/i, /estudante/i, /discente/i]);
}

function extrairCapacidadesSaep(linha) {
    const texto = obterValorPorPadroesSaep(linha, [/capacidade/i, /compet[eê]ncia/i, /habilidade/i, /descri/i, /item/i]);
    if (!texto) {
        return [];
    }

    return texto.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
}

function marcarSePareceCriticoSaep(linha) {
    const textoLinha = Object.values(linha || {})
        .map((valor) => normalizarTextoSaep(valor).toLowerCase())
        .join(" ");

    return /cr[ií]tic|aten[cç][aã]o|baixo|abaixo|risco|insuficiente|reprov/i.test(textoLinha);
}

function gerarAnaliseImportacaoSaep(planilhas) {
    const cruzamento = Array.isArray(planilhas.cruzamento) ? planilhas.cruzamento : [];
    const itens = Array.isArray(planilhas.itens) ? planilhas.itens : [];
    const detalhes = Array.isArray(planilhas.detalhes) ? planilhas.detalhes : [];
    const individual = Array.isArray(planilhas.individual) ? planilhas.individual : [];
    const todas = [...cruzamento, ...itens, ...detalhes, ...individual];
    const alunos = new Set();
    const notas = [];
    const capacidadesCriticas = new Map();
    const alertas = [];

    todas.forEach((linha) => {
        const nomeAluno = extrairNomeAlunoSaep(linha);
        if (nomeAluno) {
            alunos.add(nomeAluno);
        }

        const nota = extrairNumeroDaLinhaSaep(linha, [/nota/i, /m[eé]dia/i, /resultado/i, /score/i, /pontos?/i]);
        if (nota !== null) {
            notas.push(nota);
        }

        extrairCapacidadesSaep(linha).forEach((capacidade) => {
            const chave = capacidade.toLowerCase();
            const atual = capacidadesCriticas.get(chave) || { nome: capacidade, total: 0 };
            atual.total += marcarSePareceCriticoSaep(linha) ? 1 : 0;
            capacidadesCriticas.set(chave, atual);
        });
    });

    const mediaGeral = notas.length > 0
        ? (notas.reduce((soma, item) => soma + item, 0) / notas.length).toFixed(1)
        : "-";

    const abaixoMeta = notas.filter((nota) => nota < 7).length;
    const principais = Array.from(capacidadesCriticas.values())
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);

    if (individual.length === 0 && notas.length === 0) {
        alertas.push("O arquivo foi importado, mas não foi possível identificar notas ou alunos nas abas analisadas.");
    }

    if (abaixoMeta > 0) {
        alertas.push(`${abaixoMeta} registro(s) ficaram abaixo da meta de 7,0.`);
    }

    if (principais.length > 0) {
        alertas.push(`Capacidades críticas recorrentes: ${principais.map((item) => item.nome).join(", ")}.`);
    }

    const sugestoesPlano = [];
    if (abaixoMeta > 0) {
        sugestoesPlano.push("Reforçar intervenção pedagógica para os alunos abaixo da meta.");
    }
    if (principais.length > 0) {
        sugestoesPlano.push("Priorizar as capacidades mais críticas no plano de ação.");
    }
    if (individual.length > 0) {
        sugestoesPlano.push("Usar a aba Desempenho Individual para acompanhar a evolução de cada estudante.");
    }
    if (sugestoesPlano.length === 0) {
        sugestoesPlano.push("Cadastrar avaliações e ações para alimentar a análise automaticamente.");
    }

    return {
        totais: {
            cruzamento: cruzamento.length,
            itens: itens.length,
            detalhes: detalhes.length,
            individual: individual.length
        },
        totalAlunos: alunos.size,
        mediaGeral,
        alunosAbaixoMeta: abaixoMeta,
        capacidadesCriticas: principais,
        alertas,
        sugestoesPlano
    };
}

function obterUltimaAnaliseImportacaoSaep(codigoTurma) {
    const historicoTurma = obterHistoricoImportacaoTurmaSaep(codigoTurma);
    if (historicoTurma.length === 0) {
        return null;
    }

    return historicoTurma[historicoTurma.length - 1]?.analise || null;
}

function extrairDataSaep(linha) {
    const valor = obterValorPorPadroesSaep(linha, [/^data$/i, /data/i, /dt/i, /date/i]);
    return valor || "";
}

function resumirLinhaSaep(linha, limite = 140) {
    const texto = Object.values(linha || {})
        .map((valor) => normalizarTextoSaep(valor))
        .filter(Boolean)
        .slice(0, 4)
        .join(" · ");

    if (texto.length <= limite) {
        return texto;
    }

    return `${texto.slice(0, limite - 1)}…`;
}

function obterLimiteSaepPorEscala(valor, limitePercentual) {
    const numero = Number(valor || 0);

    if (!Number.isFinite(numero)) {
        return limitePercentual;
    }

    if (numero <= 1) {
        return limitePercentual / 100;
    }

    if (numero <= 10) {
        return limitePercentual / 10;
    }

    return limitePercentual;
}

function estaAbaixoDoLimiteSaep(valor, limitePercentual) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
        return false;
    }

    return numero < obterLimiteSaepPorEscala(numero, limitePercentual);
}

function limparRegistrosImportadosSaep(codigoTurma) {
    ["saepAcoes", "saepAvaliacoesObjetivo", "saepAvaliacoesPratico"].forEach((storageKey) => {
        const registros = carregarTurmasDoStorage(storageKey) || [];
        const filtrados = registros.filter((item) => !(item?.codigoTurma === codigoTurma && item?.origem === "importacao"));
        salvarTurmasNoStorage(filtrados, storageKey);
    });
}

function salvarRegistrosImportadosSaep(codigoTurma, registrosImportados) {
    const acoes = carregarTurmasDoStorage("saepAcoes") || [];
    const avaliacoesObjetivo = carregarTurmasDoStorage("saepAvaliacoesObjetivo") || [];
    const avaliacoesPratico = carregarTurmasDoStorage("saepAvaliacoesPratico") || [];

    salvarTurmasNoStorage([...acoes, ...registrosImportados.acoes], "saepAcoes");
    salvarTurmasNoStorage([...avaliacoesObjetivo, ...registrosImportados.objetivos], "saepAvaliacoesObjetivo");
    salvarTurmasNoStorage([...avaliacoesPratico, ...registrosImportados.praticos], "saepAvaliacoesPratico");
}

function gerarRegistrosImportacaoSaep(codigoTurma, planilhas, importacaoId) {
    const cruzamento = Array.isArray(planilhas.cruzamento) ? planilhas.cruzamento : [];
    const itens = Array.isArray(planilhas.itens) ? planilhas.itens : [];
    const detalhes = Array.isArray(planilhas.detalhes) ? planilhas.detalhes : [];
    const individual = Array.isArray(planilhas.individual) ? planilhas.individual : [];

    const criarAcaoSaep = (linha, indice) => {
        const tituloBase = obterValorPorPadroesSaep(linha, [/^ação$/i, /acao/i, /t[ií]tulo/i, /item/i, /descri/i]);
        const data = extrairDataSaep(linha) || new Date().toISOString().slice(0, 10);
        const statusTexto = resumirLinhaSaep(linha).toLowerCase();

        return {
            id: `${importacaoId}_acao_${indice}`,
            codigoTurma,
            titulo: tituloBase || `Acompanhamento importado ${indice + 1}`,
            data,
            responsavel: "Importação SAEP",
            status: /conclu|finaliz|ok/i.test(statusTexto) ? "Concluído" : "Em andamento",
            descricao: resumirLinhaSaep(linha),
            origem: "importacao",
            importacaoId
        };
    };

    const criarResumoImportado = (linhasAvaliacao, linhasCapacidade, tipo, origem) => {
        const registrosAvaliacao = linhasAvaliacao.map((linha) => ({
            nome: extrairNomeAlunoSaep(linha),
            nota: extrairNumeroDaLinhaSaep(linha, [/nota/i, /m[eé]dia/i, /resultado/i, /score/i, /pontos?/i]),
            capacidades: extrairCapacidadesSaep(linha)
        })).filter((item) => item.nota !== null);

        const alunosBaixoDesempenho = registrosAvaliacao
            .filter((item) => item.nome && estaAbaixoDoLimiteSaep(item.nota, 65))
            .map((item) => ({
                nome: item.nome,
                nota: Number(item.nota).toFixed(1),
                capacidades: item.capacidades.join(", ")
            }));

        const capacidades = linhasCapacidade.flatMap((linha) => {
            const nota = extrairNumeroDaLinhaSaep(linha, [/nota/i, /m[eé]dia/i, /resultado/i, /score/i, /pontos?/i]);
            return extrairCapacidadesSaep(linha).map((capacidade) => ({
                capacidade,
                nota,
                situacao: nota !== null && estaAbaixoDoLimiteSaep(nota, 70) ? "crítica" : "adequada"
            }));
        }).filter((item) => item.nota !== null && estaAbaixoDoLimiteSaep(item.nota, 70));

        const media = registrosAvaliacao.length > 0
            ? (registrosAvaliacao.reduce((total, item) => total + Number(item.nota || 0), 0) / registrosAvaliacao.length).toFixed(1)
            : "";
        const data = extrairDataSaep(linhasAvaliacao[0] || linhasCapacidade[0] || {}) || new Date().toISOString().slice(0, 10);

        return {
            id: `${importacaoId}_${tipo}_resumo`,
            codigoTurma,
            tipo,
            data,
            notaMedia: media,
            observacoes: `Importação ${origem}. ${alunosBaixoDesempenho.length} aluno(s) abaixo de 65% e ${capacidades.length} capacidade(s) abaixo de 70%.`,
            alunosBaixoDesempenho,
            capacidades,
            origem: "importacao",
            importacaoId,
            fonte: origem
        };
    };

    const acoes = itens.map((linha, indice) => criarAcaoSaep(linha, indice));
    const objetivosBase = cruzamento.length > 0 ? cruzamento : individual;
    const praticosBase = detalhes.length > 0 ? detalhes : individual;

    return {
        acoes,
        objetivos: objetivosBase.length > 0 || itens.length > 0
            ? [criarResumoImportado(objetivosBase, [...itens, ...detalhes], "objetivo", "Cruzamento/Individual")]
            : [],
        praticos: praticosBase.length > 0
            ? [criarResumoImportado(praticosBase, [...detalhes, ...itens], "pratico", "Detalhes/Individual")]
            : []
    };
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
        fecharModalAvaliacaoSaep();
        renderizarDetalhesSaep();
        alert("Arquivo importado com sucesso. A tabela de avaliações foi atualizada com a análise do SAEP.");
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
                ano: item.ano ?? "",
                notaEscola: item.notaEscola ?? "",
                curso: item.curso ?? "",
                notaCurso: item.notaCurso ?? item.notaSegmento ?? "",
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
        ano: ativo?.ano ?? "",
        notaEscola: ativo?.notaEscola ?? "",
        curso: ativo?.curso ?? "",
        notaCurso: ativo?.notaCurso ?? ativo?.notaSegmento ?? "",
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

function carregarHistoricoEscolarStorage() {
    const dados = carregarTurmasDoStorage(SAEP_HISTORICO_ESCOLA_STORAGE_KEY);

    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return {};
    }

    return dados;
}

function salvarHistoricoEscolarStorage(dados) {
    salvarTurmasNoStorage(dados, SAEP_HISTORICO_ESCOLA_STORAGE_KEY);
}

function normalizarHistoricoEscolarTurma(item) {
    if (!item || typeof item !== "object") {
        return { registros: [] };
    }

    if (Array.isArray(item.registros)) {
        return { registros: item.registros };
    }

    if (Array.isArray(item)) {
        return { registros: item };
    }

    return { registros: [] };
}

function obterHistoricoEscolarDaTurma(codigoTurma) {
    const dados = carregarHistoricoEscolarStorage();
    const turmaDados = normalizarHistoricoEscolarTurma(dados[codigoTurma]);

    return (turmaDados.registros || []).slice().sort((a, b) => {
        const anoA = Number(a.ano || 0);
        const anoB = Number(b.ano || 0);
        if (anoA !== anoB) {
            return anoB - anoA;
        }

        return new Date(b.atualizadoEm || b.criadoEm || 0).getTime() - new Date(a.atualizadoEm || a.criadoEm || 0).getTime();
    });
}

async function carregarHistoricoEscolarDaTurma(codigoTurma) {
    const registrosLocais = obterHistoricoEscolarDaTurma(codigoTurma);

    const endpoints = [
        `${DIAGNOSTICAS_API_BASE_URL}/turmas/${encodeURIComponent(codigoTurma)}/historico-escola`,
        `${DIAGNOSTICAS_API_BASE_URL}/escola/historico/${encodeURIComponent(codigoTurma)}`
    ];

    for (const endpoint of endpoints) {
        try {
            const resposta = await fetch(endpoint);
            if (!resposta.ok) {
                throw new Error("Não foi possível carregar o histórico escolar.");
            }

            const registros = await resposta.json();
            if (Array.isArray(registros) && registros.length > 0) {
                const dados = carregarHistoricoEscolarStorage();
                dados[codigoTurma] = { registros };
                salvarHistoricoEscolarStorage(dados);
                return obterHistoricoEscolarDaTurma(codigoTurma);
            }
            return registrosLocais;
        } catch (error) {
            console.warn(`Falha ao carregar o histórico escolar em ${endpoint}, tentando o próximo endpoint.`, error);
        }
    }

    return registrosLocais;
}

async function salvarRegistroHistoricoEscolarDaTurma(codigoTurma, registro, registroId = "") {
    const dados = carregarHistoricoEscolarStorage();
    const turmaDados = normalizarHistoricoEscolarTurma(dados[codigoTurma]);
    const registros = [...(turmaDados.registros || [])];
    const registroExistente = registros.find((item) => item.id === registroId);

    const registroPersistido = {
        id: registroId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ano: registro.ano,
        notaGeralEscola: registro.notaGeralEscola,
        notaProvaObjetiva: registro.notaProvaObjetiva,
        notaProvaPratica: registro.notaProvaPratica,
        segmento: registro.segmento,
        criadoEm: registroExistente?.criadoEm || new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
    };

    if (registroId) {
        const indice = registros.findIndex((item) => item.id === registroId);
        if (indice >= 0) {
            registros[indice] = { ...registros[indice], ...registroPersistido };
        }
    } else {
        registros.push(registroPersistido);
    }

    dados[codigoTurma] = { registros };
    salvarHistoricoEscolarStorage(dados);

    const endpoints = [
        `${DIAGNOSTICAS_API_BASE_URL}/turmas/${encodeURIComponent(codigoTurma)}/historico-escola`,
        `${DIAGNOSTICAS_API_BASE_URL}/escola/historico`
    ];

    for (const endpoint of endpoints) {
        try {
            const resposta = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    turmaId: codigoTurma,
                    registroId: registroPersistido.id,
                    ano: registroPersistido.ano,
                    notaGeralEscola: registroPersistido.notaGeralEscola,
                    notaProvaObjetiva: registroPersistido.notaProvaObjetiva,
                    notaProvaPratica: registroPersistido.notaProvaPratica,
                    segmento: registroPersistido.segmento
                })
            });

            if (!resposta.ok) {
                throw new Error("Não foi possível sincronizar o registro no servidor.");
            }
            break;
        } catch (error) {
            console.warn(`Falha ao sincronizar o histórico escolar em ${endpoint}, tentando o próximo endpoint.`, error);
        }
    }

    return registroPersistido;
}

async function excluirRegistroHistoricoEscolarDaTurma(codigoTurma, registroId) {
    const dados = carregarHistoricoEscolarStorage();
    const turmaDados = normalizarHistoricoEscolarTurma(dados[codigoTurma]);
    const registros = (turmaDados.registros || []).filter((item) => item.id !== registroId);

    dados[codigoTurma] = { registros };
    salvarHistoricoEscolarStorage(dados);

    const endpoints = [
        `${DIAGNOSTICAS_API_BASE_URL}/turmas/${encodeURIComponent(codigoTurma)}/historico-escola/${encodeURIComponent(registroId)}`,
        `${DIAGNOSTICAS_API_BASE_URL}/escola/historico/${encodeURIComponent(registroId)}`
    ];

    for (const endpoint of endpoints) {
        try {
            const resposta = await fetch(endpoint, {
                method: "DELETE"
            });
            if (!resposta.ok) {
                throw new Error("Não foi possível remover o registro do servidor.");
            }
            break;
        } catch (error) {
            console.warn(`Falha ao remover o histórico escolar em ${endpoint}, tentando o próximo endpoint.`, error);
        }
    }
}

async function renderizarFormularioHistoricoSaep(codigoTurma, curso, resumoBase) {
    const container = document.getElementById("saepHistoricoConteudo");
    if (!container) {
        return;
    }

    container.innerHTML = '<div class="saep-historico-loading"><span class="saep-historico-loading__dot"></span>Carregando histórico escolar...</div>';

    const registros = await carregarHistoricoEscolarDaTurma(codigoTurma);
    const registrosOrdenados = (Array.isArray(registros) ? registros : []).slice().sort((a, b) => {
        const anoA = Number(a.ano || 0);
        const anoB = Number(b.ano || 0);
        if (anoA !== anoB) {
            return anoB - anoA;
        }

        return new Date(b.atualizadoEm || b.criadoEm || 0).getTime() - new Date(a.atualizadoEm || a.criadoEm || 0).getTime();
    });

    const agrupadosPorAno = registrosOrdenados.reduce((acc, item) => {
        const ano = item.ano || "Sem ano";
        if (!acc[ano]) {
            acc[ano] = [];
        }
        acc[ano].push(item);
        return acc;
    }, {});

    const anosOrdenados = Object.keys(agrupadosPorAno).sort((a, b) => Number(b) - Number(a));

    container.innerHTML = `
        <div class="saep-historico-intro">
            <p class="saep-muted">Histórico escolar</p>
            <h4 class="saep-historico-intro__title">Registro por ano e segmento</h4>
            <p class="saep-muted">Turma: ${codigoTurma} · Curso: ${curso || "-"}</p>
            <div class="saep-historico-kpis">
                <span class="saep-historico-chip">Registros: ${registrosOrdenados.length}</span>
                <span class="saep-historico-chip">Anos: ${anosOrdenados.length}</span>
            </div>
        </div>
        <div class="saep-historico-summary-card">
            <div class="saep-historico-summary-card__head">
                <strong>Cadastro do histórico escolar</strong>
                <span class="saep-badge">${registrosOrdenados.length > 0 ? "Ativo" : "Sem registros"}</span>
            </div>
            <p class="saep-muted">Cadastre a nota geral da escola, a prova objetiva, a prova prática e o segmento para cada ano.</p>
        </div>
        <div class="saep-historico-segmentos-wrap">
            <div class="saep-historico-segmentos-head">
                <h5>Comparativo entre anos por segmento</h5>
                <span class="saep-muted">Gráficos em azul SENAI com evolução anual por segmento.</span>
            </div>
            <div id="saepHistoricoComparativoSegmentos" class="saep-historico-segmentos"></div>
        </div>
        ${registrosOrdenados.length === 0 ? `
            <div class="saep-historico-empty">
                <strong>Nenhum registro encontrado.</strong>
                <span>Use o botão acima para adicionar o primeiro histórico da escola.</span>
            </div>
        ` : anosOrdenados.map((ano) => `
            <section class="saep-historico-year-group">
                <div class="saep-historico-year-group__head">
                    <h5>Ano ${ano}</h5>
                    <span>${agrupadosPorAno[ano].length} registro(s)</span>
                </div>
                <div class="saep-historico-card-grid">
                    <article class="saep-historico-card">
                        <div class="saep-historico-card__top">
                            <div>
                                <strong>Histórico do ano</strong>
                                <div class="saep-muted">${ano}</div>
                            </div>
                            <span class="saep-badge">${ano}</span>
                        </div>
                        <div class="saep-historico-card__items">
                            ${agrupadosPorAno[ano].map((item) => `
                                <div class="saep-historico-card__item">
                                    <div class="saep-historico-card__item-head">
                                        <strong>${item.segmento || "Segmento não informado"}</strong>
                                        <div class="saep-historico-card__actions">
                                            <button type="button" class="btn-secondary saep-inline-btn" data-editar-historico="${item.id}">Editar</button>
                                            <button type="button" class="btn-delete saep-inline-danger" data-excluir-historico="${item.id}">Excluir</button>
                                        </div>
                                    </div>
                                    <div class="saep-analysis-grid">
                                        <div><span>Nota geral da escola</span><strong>${item.notaGeralEscola ?? item.notaEscola ?? "-"}</strong></div>
                                        <div><span>Prova objetiva</span><strong>${item.notaProvaObjetiva ?? item.notaObjetivaSegmento ?? "-"}</strong></div>
                                        <div><span>Prova prática</span><strong>${item.notaProvaPratica ?? item.notaPraticaSegmento ?? "-"}</strong></div>
                                        <div><span>Segmento</span><strong>${item.segmento || "-"}</strong></div>
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                    </article>
                </div>
            </section>
        `).join("")}
    `;

    renderizarGraficosHistoricoPorSegmentoSaep(registrosOrdenados);

    container.querySelectorAll("[data-editar-historico]").forEach((botao) => {
        botao.onclick = () => {
            const id = botao.getAttribute("data-editar-historico");
            const registro = registrosOrdenados.find((item) => item.id === id);
            if (!registro) {
                return;
            }

            abrirModalHistoricoCadastroSaep(codigoTurma, curso, registro, resumoBase);
        };
    });

    container.querySelectorAll("[data-excluir-historico]").forEach((botao) => {
        botao.onclick = () => {
            const id = botao.getAttribute("data-excluir-historico");
            abrirModalExcluirHistoricoEscolar(codigoTurma, id, resumoBase);
        };
    });

    configurarModalHistoricoCadastroSaep(codigoTurma, curso, resumoBase);
    configurarModalExclusaoHistoricoEscolar(codigoTurma, resumoBase);
}

function obterNumeroHistoricoSaep(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

function calcularMediaHistoricoSaep(valores) {
    if (!Array.isArray(valores) || valores.length === 0) {
        return null;
    }

    const soma = valores.reduce((total, valor) => total + valor, 0);
    return Number((soma / valores.length).toFixed(2));
}

function montarSerieHistoricoSegmentoSaep(registrosSegmento) {
    const porAno = {};

    registrosSegmento.forEach((registro) => {
        const anoNumerico = Number(registro?.ano || 0);
        if (!Number.isFinite(anoNumerico) || anoNumerico <= 0) {
            return;
        }

        if (!porAno[anoNumerico]) {
            porAno[anoNumerico] = {
                escola: [],
                objetiva: [],
                pratica: []
            };
        }

        const notaEscola = obterNumeroHistoricoSaep(registro?.notaGeralEscola ?? registro?.notaEscola);
        const notaObjetiva = obterNumeroHistoricoSaep(registro?.notaProvaObjetiva ?? registro?.notaObjetivaSegmento);
        const notaPratica = obterNumeroHistoricoSaep(registro?.notaProvaPratica ?? registro?.notaPraticaSegmento);

        if (notaEscola !== null) {
            porAno[anoNumerico].escola.push(notaEscola);
        }
        if (notaObjetiva !== null) {
            porAno[anoNumerico].objetiva.push(notaObjetiva);
        }
        if (notaPratica !== null) {
            porAno[anoNumerico].pratica.push(notaPratica);
        }
    });

    return Object.keys(porAno)
        .map((ano) => Number(ano))
        .sort((a, b) => a - b)
        .map((ano) => ({
            ano: String(ano),
            notaEscola: calcularMediaHistoricoSaep(porAno[ano].escola),
            notaObjetiva: calcularMediaHistoricoSaep(porAno[ano].objetiva),
            notaPratica: calcularMediaHistoricoSaep(porAno[ano].pratica)
        }));
}

function renderizarGraficoComparativoSegmentoSaep(containerId, serie) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    if (!window.Recharts || !window.React || !window.ReactDOM) {
        renderizarGraficoComparativoSegmentoSaepFallback(container, serie);
        return;
    }

    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = window.Recharts;

    ReactDOM.render(
        React.createElement(
            ResponsiveContainer,
            { width: "100%", height: "100%" },
            React.createElement(
                BarChart,
                { data: serie },
                React.createElement(CartesianGrid, { strokeDasharray: "3 3" }),
                React.createElement(XAxis, { dataKey: "ano" }),
                React.createElement(YAxis, { domain: [0, 10] }),
                React.createElement(Tooltip, {}),
                React.createElement(Legend, {}),
                React.createElement(Bar, { dataKey: "notaEscola", name: "Escola", fill: "#003da5", radius: [4, 4, 0, 0] }),
                React.createElement(Bar, { dataKey: "notaObjetiva", name: "Objetiva", fill: "#1e6fe8", radius: [4, 4, 0, 0] }),
                React.createElement(Bar, { dataKey: "notaPratica", name: "Prática", fill: "#60a5fa", radius: [4, 4, 0, 0] })
            )
        ),
        container
    );
}

function formatarValorHistoricoSaep(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toFixed(1) : "-";
}

function renderizarBarraHistoricoSaep(valor, classe) {
    const numero = Number(valor);
    const percentual = Number.isFinite(numero) ? Math.max(0, Math.min((numero / 10) * 100, 100)) : 0;

    return `
        <div class="saep-historico-fallback-bar ${classe}">
            <div class="saep-historico-fallback-bar__fill" style="width:${percentual}%;"></div>
            <span class="saep-historico-fallback-bar__label">${formatarValorHistoricoSaep(valor)}</span>
        </div>
    `;
}

function renderizarGraficoComparativoSegmentoSaepFallback(container, serie) {
    if (!container) {
        return;
    }

    const linhas = Array.isArray(serie) ? serie : [];
    if (linhas.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Sem dados suficientes para o gráfico.</div>';
        return;
    }

    container.innerHTML = `
        <div class="saep-historico-fallback-chart">
            <div class="saep-historico-fallback-legend">
                <span class="saep-historico-fallback-legend__item"><i class="saep-historico-fallback-legend__dot saep-historico-fallback-legend__dot--escola"></i>Escola</span>
                <span class="saep-historico-fallback-legend__item"><i class="saep-historico-fallback-legend__dot saep-historico-fallback-legend__dot--objetiva"></i>Objetiva</span>
                <span class="saep-historico-fallback-legend__item"><i class="saep-historico-fallback-legend__dot saep-historico-fallback-legend__dot--pratica"></i>Prática</span>
            </div>
            <div class="saep-historico-fallback-rows">
                ${linhas.map((item) => `
                    <div class="saep-historico-fallback-row">
                        <div class="saep-historico-fallback-row__year">${item.ano}</div>
                        <div class="saep-historico-fallback-row__bars">
                            ${renderizarBarraHistoricoSaep(item.notaEscola, "saep-historico-fallback-bar--escola")}
                            ${renderizarBarraHistoricoSaep(item.notaObjetiva, "saep-historico-fallback-bar--objetiva")}
                            ${renderizarBarraHistoricoSaep(item.notaPratica, "saep-historico-fallback-bar--pratica")}
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}

function renderizarGraficosHistoricoPorSegmentoSaep(registros) {
    const container = document.getElementById("saepHistoricoComparativoSegmentos");
    if (!container) {
        return;
    }

    const registrosValidos = Array.isArray(registros) ? registros : [];
    if (registrosValidos.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Adicione registros para visualizar o comparativo entre anos por segmento.</div>';
        return;
    }

    const agrupado = registrosValidos.reduce((acc, item) => {
        const segmento = String(item?.segmento || "Sem segmento").trim() || "Sem segmento";
        if (!acc[segmento]) {
            acc[segmento] = [];
        }
        acc[segmento].push(item);
        return acc;
    }, {});

    const segmentos = Object.keys(agrupado).sort((a, b) => a.localeCompare(b, "pt-BR"));
    container.innerHTML = segmentos.map((segmento, indice) => {
        const idGrafico = `saepHistoricoSegmentoChart_${indice}`;
        return `
            <article class="saep-historico-segment-card">
                <div class="saep-historico-segment-card__head">
                    <strong>${segmento}</strong>
                    <span>${agrupado[segmento].length} registro(s)</span>
                </div>
                <div id="${idGrafico}" class="saep-historico-segment-card__chart"></div>
            </article>
        `;
    }).join("");

    segmentos.forEach((segmento, indice) => {
        const serie = montarSerieHistoricoSegmentoSaep(agrupado[segmento]);
        if (serie.length === 0) {
            const alvo = document.getElementById(`saepHistoricoSegmentoChart_${indice}`);
            if (alvo) {
                alvo.innerHTML = '<div class="saep-empty-state">Sem anos válidos para este segmento.</div>';
            }
            return;
        }

        renderizarGraficoComparativoSegmentoSaep(`saepHistoricoSegmentoChart_${indice}`, serie);
    });
}

function abrirModalHistoricoCadastroSaep(codigoTurma, curso, registro = null, resumoBase = null) {
    const modal = document.getElementById("modalHistoricoCadastroSaep");
    const campoRegistroId = document.getElementById("histRegistroId");
    const campoAno = document.getElementById("histAnoSaep");
    const campoNotaEscola = document.getElementById("histNotaEscola");
    const campoSegmento = document.getElementById("histSegmentoSaep");
    const campoNotaObjetiva = document.getElementById("histNotaObjetivaSegmento");
    const campoNotaPratica = document.getElementById("histNotaPraticaSegmento");

    if (!modal || !campoRegistroId || !campoAno || !campoNotaEscola || !campoSegmento || !campoNotaObjetiva || !campoNotaPratica) {
        return;
    }

    campoRegistroId.value = registro?.id || "";
    campoAno.value = registro?.ano || new Date().getFullYear();
    campoNotaEscola.value = registro?.notaGeralEscola ?? registro?.notaEscola ?? "";
    campoSegmento.value = registro?.segmento || "";
    campoNotaObjetiva.value = registro?.notaProvaObjetiva ?? registro?.notaObjetivaSegmento ?? "";
    campoNotaPratica.value = registro?.notaProvaPratica ?? registro?.notaPraticaSegmento ?? "";

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    configurarModalHistoricoCadastroSaep(codigoTurma, curso, resumoBase);
}

function fecharModalHistoricoCadastroSaep() {
    const modal = document.getElementById("modalHistoricoCadastroSaep");
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function abrirModalExcluirHistoricoEscolar(codigoTurma, registroId, resumoBase = null) {
    const modal = document.getElementById("modalExcluirHistoricoEscolar");
    const campoRegistroId = document.getElementById("histRegistroExcluirId");
    if (!modal || !campoRegistroId) {
        return;
    }

    campoRegistroId.value = registroId || "";
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    configurarModalExclusaoHistoricoEscolar(codigoTurma, resumoBase);
}

function fecharModalExcluirHistoricoEscolar() {
    const modal = document.getElementById("modalExcluirHistoricoEscolar");
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function configurarModalExclusaoHistoricoEscolar(codigoTurma, resumoBase = null) {
    const modal = document.getElementById("modalExcluirHistoricoEscolar");
    const botaoConfirmar = document.getElementById("btnConfirmarExcluirHistoricoEscolar");
    const botaoCancelar = document.getElementById("btnCancelarExcluirHistoricoEscolar");
    const campoRegistroId = document.getElementById("histRegistroExcluirId");

    if (!modal || !botaoConfirmar || !botaoCancelar || !campoRegistroId) {
        return;
    }

    botaoCancelar.onclick = fecharModalExcluirHistoricoEscolar;
    modal.onclick = (event) => {
        if (event.target === modal) {
            fecharModalExcluirHistoricoEscolar();
        }
    };

    botaoConfirmar.onclick = async () => {
        const registroId = campoRegistroId.value;
        if (!registroId) {
            return;
        }

        await excluirRegistroHistoricoEscolarDaTurma(codigoTurma, registroId);
        fecharModalExcluirHistoricoEscolar();
        await renderizarFormularioHistoricoSaep(codigoTurma, null, resumoBase);
    };
}

function configurarModalHistoricoCadastroSaep(codigoTurma, curso, resumoBase) {
    const botaoCadastro = document.getElementById("btnCadastroHistoricoSaep");
    const modal = document.getElementById("modalHistoricoCadastroSaep");
    const form = document.getElementById("formHistoricoCadastroSaep");
    const botaoCancelar = document.getElementById("btnCancelarHistoricoCadastroSaep");

    if (!botaoCadastro || !modal || !form || !botaoCancelar) {
        return;
    }

    botaoCadastro.onclick = () => abrirModalHistoricoCadastroSaep(codigoTurma, curso, null, resumoBase);
    botaoCancelar.onclick = fecharModalHistoricoCadastroSaep;
    modal.onclick = (event) => {
        if (event.target === modal) {
            fecharModalHistoricoCadastroSaep();
        }
    };

    form.onsubmit = async (event) => {
        event.preventDefault();

        const registroId = document.getElementById("histRegistroId").value;
        const ano = document.getElementById("histAnoSaep").value.trim();
        const segmento = document.getElementById("histSegmentoSaep").value.trim();

        if (!ano || !segmento) {
            alert("Informe o ano e o segmento antes de salvar.");
            return;
        }

        await salvarRegistroHistoricoEscolarDaTurma(codigoTurma, {
            ano,
            notaGeralEscola: document.getElementById("histNotaEscola").value,
            segmento,
            notaProvaObjetiva: document.getElementById("histNotaObjetivaSegmento").value,
            notaProvaPratica: document.getElementById("histNotaPraticaSegmento").value
        }, registroId);

        fecharModalHistoricoCadastroSaep();
        form.reset();
        await renderizarFormularioHistoricoSaep(codigoTurma, curso, resumoBase);
    };
}

function renderizarSubAbaHistoricoSaep(subAba, codigoTurma, turma, resumoBase) {
    const abas = document.querySelectorAll("#saepHistoricoTabs .saep-historico-tab");
    salvarSubAbaHistoricoSaep(codigoTurma, subAba);

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

    renderizarSubAbaHistoricoSaep(obterSubAbaHistoricoSaep(codigoTurma), codigoTurma, turma, resumoBase);
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

async function renderizarResumoNotasSaep(codigoTurma, avaliacoesPratico = []) {
    const container = document.getElementById("saepGraficoNotas");
    if (!container) {
        return;
    }

    const diagnosticas = codigoTurma
        ? await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma)
        : [];
    const avaliacoesDiagnosticas = diagnosticas.map(({ avaliacao }) => ({
        data: avaliacao?.data_avaliacao || "",
        notaMedia: avaliacao?.nota_media ?? 0
    })).filter((item) => item.data);

    const blocos = [
        {
            titulo: "Avaliações diagnósticas",
            itens: avaliacoesDiagnosticas
        },
        {
            titulo: "Avaliações práticas",
            itens: avaliacoesPratico
        }
    ];

    const possuiNotas = blocos.some((bloco) => bloco.itens.length > 0);
    if (!possuiNotas) {
        container.innerHTML = '<div class="saep-empty-state">Cadastre notas das avaliações diagnósticas e práticas para exibir o resumo aqui.</div>';
        return;
    }

    container.innerHTML = `
        <div class="saep-resumo-stack">
            ${blocos.map((bloco) => {
                if (bloco.itens.length === 0) {
                    return `
                        <div class="saep-resumo-item">
                            <strong>${bloco.titulo}</strong>
                            <p class="saep-muted">Nenhuma nota cadastrada.</p>
                        </div>
                    `;
                }

                const itensOrdenados = bloco.itens.slice().sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
                const media = (itensOrdenados.reduce((total, item) => total + Number(item.notaMedia || 0), 0) / itensOrdenados.length).toFixed(1);

                return `
                    <div class="saep-resumo-item">
                        <div class="saep-resumo-item__head">
                            <strong>${bloco.titulo}</strong>
                            <span class="saep-badge">Média ${media}</span>
                        </div>
                        <ul class="saep-resumo-list">
                            ${itensOrdenados.slice(0, 4).map((item) => `
                                <li>
                                    <span>${formatarDataParaExibirSaep(item.data)}</span>
                                    <strong>Nota ${item.notaMedia || "-"}</strong>
                                </li>
                            `).join("")}
                        </ul>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

async function renderizarResumoCapacidadesSaep(codigoTurma) {
    const container = document.getElementById("saepGraficoCapacidades");
    if (!container) {
        return;
    }

    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
    const capacidadesCriticas = diagnosticas.flatMap(({ detalhes }) => Array.isArray(detalhes?.capacidadesCriticas)
        ? detalhes.capacidadesCriticas
        : (Array.isArray(detalhes?.capacidades) ? detalhes.capacidades : []));

    if (capacidadesCriticas.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Cadastre avaliações diagnósticas para destacar os pontos críticos por capacidade.</div>';
        return;
    }

    const capacidadesEmAtencao = capacidadesCriticas.slice(0, 8);

    container.innerHTML = `
        <div class="saep-resumo-stack">
            <div class="saep-resumo-item">
                <strong>Capacidades em atenção nas avaliações</strong>
                ${capacidadesEmAtencao.length > 0 ? `
                    <ul class="saep-resumo-list">
                        ${capacidadesEmAtencao.map((item) => `
                            <li>
                                <span>${item.capacidade || "-"}</span>
                                <strong>${item.conhecimento || item.subfuncao || item.percentual_desenvolvimento || "atenção"}</strong>
                            </li>
                        `).join("")}
                    </ul>
                ` : '<p class="saep-muted">As avaliações diagnósticas ainda não sinalizaram capacidades críticas ou conhecimentos em atenção.</p>'}
            </div>
        </div>
    `;
}

function renderizarResumoPlanoSaep(codigoTurma, acoes = []) {
    const container = document.getElementById("saepGraficoPlano");
    if (!container) {
        return;
    }

    const etapas = (obterDadosPlataformasTurma(codigoTurma)?.etapas || []).filter((item) => item.status !== "Concluída");
    const acoesEmAndamento = acoes.filter((item) => item.status === "Em andamento");

    if (acoesEmAndamento.length === 0 && etapas.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Nenhuma ação ou etapa em andamento no momento.</div>';
        return;
    }

    container.innerHTML = `
        <div class="saep-resumo-stack">
            <div class="saep-resumo-item">
                <div class="saep-resumo-item__head">
                    <strong>Ações em andamento</strong>
                    <span class="saep-badge">${acoesEmAndamento.length}</span>
                </div>
                ${acoesEmAndamento.length > 0 ? `
                    <ul class="saep-resumo-list">
                        ${acoesEmAndamento.map((acao) => `
                            <li>
                                <span>${acao.titulo}</span>
                                <strong>${formatarDataParaExibirSaep(acao.data)}</strong>
                            </li>
                        `).join("")}
                    </ul>
                ` : '<p class="saep-muted">Nenhuma ação do plano está marcada como Em andamento.</p>'}
            </div>
            <div class="saep-resumo-item">
                <div class="saep-resumo-item__head">
                    <strong>Etapas abertas</strong>
                    <span class="saep-badge">${etapas.length}</span>
                </div>
                ${etapas.length > 0 ? `
                    <ul class="saep-resumo-list">
                        ${etapas.map((etapa) => `
                            <li>
                                <span>${etapa.acao}</span>
                                <strong>${etapa.status}</strong>
                            </li>
                        `).join("")}
                    </ul>
                ` : '<p class="saep-muted">Nenhuma etapa em aberto cadastrada.</p>'}
            </div>
        </div>
    `;
}

async function buscarEvolucaoDiagnosticasApi(codigoTurma) {
    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);

    return diagnosticas
        .map(({ avaliacao }) => ({
            data: avaliacao?.data_avaliacao || "",
            notaMedia: Number(avaliacao?.nota_media || 0)
        }))
        .filter((item) => item.data)
        .sort((a, b) => new Date(a.data) - new Date(b.data));
}

async function buscarAlunosBaixoDesempenhoApi(codigoTurma) {
    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
    const alunos = new Set();

    diagnosticas.forEach(({ detalhes }) => {
        const desempenho = Array.isArray(detalhes?.desempenho) ? detalhes.desempenho : [];

        desempenho.forEach((item) => {
            const nome = String(item?.aluno || "").trim();
            const acerto = Number(item?.acerto || 0);
            const erro = Number(item?.erro || 0);
            const total = acerto + erro;

            if (!nome || total <= 0) {
                return;
            }

            if ((acerto / total) * 100 < 65) {
                alunos.add(nome);
            }
        });
    });

    return Array.from(alunos);
}

async function buscarCapacidadesCriticasDiagnosticasApi(codigoTurma) {
    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
    const recorrencias = {};

    diagnosticas.forEach(({ detalhes }) => {
        const capacidadesCriticas = Array.isArray(detalhes?.capacidadesCriticas)
            ? detalhes.capacidadesCriticas
            : (Array.isArray(detalhes?.capacidades) ? detalhes.capacidades : []);

        capacidadesCriticas.forEach((item) => {
            const nome = String(item?.capacidade || "").trim();
            if (!nome) {
                return;
            }

            recorrencias[nome] = (recorrencias[nome] || 0) + 1;
        });
    });

    return Object.entries(recorrencias)
        .map(([capacidade, recorrenciasTotal]) => ({
            capacidade,
            recorrencias: Number(recorrenciasTotal || 0)
        }))
        .sort((a, b) => b.recorrencias - a.recorrencias)
        .slice(0, 8);
}

async function buscarConhecimentosDiagnosticosApi(codigoTurma) {
    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
    const recorrencias = {};

    diagnosticas.forEach(({ detalhes }) => {
        const capacidadesCriticas = Array.isArray(detalhes?.capacidadesCriticas)
            ? detalhes.capacidadesCriticas
            : (Array.isArray(detalhes?.capacidades) ? detalhes.capacidades : []);

        capacidadesCriticas.forEach((item) => {
            const nome = String(item?.conhecimento || item?.subfuncao || item?.capacidade || "").trim();
            if (!nome) {
                return;
            }

            recorrencias[nome] = (recorrencias[nome] || 0) + 1;
        });
    });

    return Object.entries(recorrencias)
        .map(([nome, recorrenciasTotal]) => ({
            nome,
            recorrencias: Number(recorrenciasTotal || 0)
        }))
        .sort((a, b) => b.recorrencias - a.recorrencias)
        .slice(0, 8);
}

async function buscarCapacidadesDiagnosticasApi(codigoTurma) {
    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
    const recorrencias = {};

    diagnosticas.forEach(({ detalhes }) => {
        const capacidades = Array.isArray(detalhes?.capacidades)
            ? detalhes.capacidades
            : (Array.isArray(detalhes?.capacidadesCriticas) ? detalhes.capacidadesCriticas : []);

        capacidades.forEach((item) => {
            const nome = String(item?.capacidade || item?.descricao || "").trim();
            if (!nome) {
                return;
            }

            recorrencias[nome] = (recorrencias[nome] || 0) + 1;
        });
    });

    return Object.entries(recorrencias)
        .map(([nome, recorrenciasTotal]) => ({
            nome,
            recorrencias: Number(recorrenciasTotal || 0)
        }))
        .sort((a, b) => b.recorrencias - a.recorrencias)
        .slice(0, 8);
}

function renderizarGraficoEvolucaoSaep(dados) {
    const container = document.getElementById("saepGraficoEvolucaoDiagnostica");
    if (!container || !window.Recharts) {
        return;
    }

    const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = window.Recharts;
    const dadosGrafico = dados.length > 0 ? dados : [{ data: "Sem dados", notaMedia: 0 }];

    ReactDOM.render(
        React.createElement(
            ResponsiveContainer,
            { width: "100%", height: "100%" },
            React.createElement(
                LineChart,
                { data: dadosGrafico },
                React.createElement(CartesianGrid, { strokeDasharray: "3 3" }),
                React.createElement(XAxis, { dataKey: "data" }),
                React.createElement(YAxis, { domain: [0, 10] }),
                React.createElement(Tooltip, {}),
                React.createElement(Line, { type: "monotone", dataKey: "notaMedia", stroke: "#2563eb", strokeWidth: 2, dot: { r: 4 } })
            )
        ),
        container
    );
}

function renderizarResumoDashboardSaep(codigoTurma) {
    const container = document.getElementById("saepResumoDashboard");
    if (!container) {
        return;
    }

    const cacheTurma = SAEP_RESUMO_DASHBOARD_CACHE[codigoTurma];
    const agora = Date.now();

    if (cacheTurma?.html) {
        container.innerHTML = cacheTurma.html;

        if (agora - cacheTurma.timestamp < SAEP_RESUMO_DASHBOARD_CACHE_TTL_MS) {
            return;
        }
    } else {
        container.innerHTML = '<div class="saep-empty-state">Carregando resumo...</div>';
    }

    Promise.all([
        carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma),
        buscarPlanosDaTurmaApi(codigoTurma)
    ]).then(([diagnosticas, planos]) => {
        const alunosSet = new Set();
        diagnosticas.forEach(({ detalhes }) => {
            const desempenho = Array.isArray(detalhes?.desempenho) ? detalhes.desempenho : [];
            desempenho.forEach((item) => {
                const nome = String(item?.aluno || "").trim();
                const acerto = Number(item?.acerto || 0);
                const erro = Number(item?.erro || 0);
                const total = acerto + erro;

                if (!nome || total <= 0) {
                    return;
                }

                if ((acerto / total) * 100 < 65) {
                    alunosSet.add(nome);
                }
            });
        });

        const alunos = Array.from(alunosSet);
        const planosAndamento = (planos || []).filter((item) => ["A iniciar", "Em andamento"].includes(item.andamento || item.status));

        const htmlResumo = `
            <div class="saep-dashboard-grid">
                <div class="saep-card">
                    <div class="saep-card__header">
                        <h3>Alunos com baixo desempenho (&lt; 65%)</h3>
                    </div>
                    <div class="saep-list-stack">
                        ${alunos.length === 0 ? '<div class="saep-empty-state">Nenhum aluno identificado com desempenho abaixo de 65%.</div>' : alunos.map((aluno) => `
                            <div class="saep-list-item">
                                <strong>${aluno}</strong>
                                <span>Diagnóstico</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
                <div class="saep-card">
                    <div class="saep-card__header">
                        <h3>Andamento do Plano de Ação</h3>
                    </div>
                    <div class="saep-list-stack">
                        ${planosAndamento.length === 0 ? '<div class="saep-empty-state">Nenhum plano em andamento.</div>' : planosAndamento.map((plano) => `
                            <div class="saep-list-item">
                                <strong>${plano.titulo || "Plano sem título"}</strong>
                                <span>${plano.andamento || plano.status || "A iniciar"}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>
        `;

        SAEP_RESUMO_DASHBOARD_CACHE[codigoTurma] = {
            html: htmlResumo,
            timestamp: Date.now()
        };
        container.innerHTML = htmlResumo;
    }).catch(() => {
        if (!cacheTurma?.html) {
            container.innerHTML = '<div class="saep-empty-state">Não foi possível carregar o resumo no momento.</div>';
        }
    });
}

async function renderizarResumoPedagogicoSaep(codigoTurma) {
    const dados = carregarDadosSaepDaTurma(codigoTurma);
    const { datas, acoes, avaliacoesObjetivo, avaliacoesPratico } = dados;
    const indicadores = calcularIndicadoresSaep({ acoes, avaliacoesObjetivo, avaliacoesPratico });
    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
    const metaEditavel = obterMetaNotaSaep(codigoTurma);
    const alunosAbaixoMetaDiagnosticas = calcularAlunosAbaixoMetaDiagnosticas(diagnosticas, metaEditavel);
    const percentualExecucaoGeral = calcularPercentualExecucaoGeral(codigoTurma, acoes);
    const analiseImportacao = obterUltimaAnaliseImportacaoSaep(codigoTurma);

    document.getElementById("saepResumoCards").innerHTML = `
        <div class="saep-metric-card">
            <span>Média da turma</span>
            <strong>${indicadores.mediaTurma !== "-" ? indicadores.mediaTurma : "Sem avaliações"}</strong>
        </div>
        <div class="saep-metric-card">
            <span>Meta</span>
            <div style="display:flex;gap:0.45rem;align-items:center;">
                <input id="saepMetaNotaInput" type="number" min="0" max="10" step="0.1" value="${metaEditavel.toFixed(1)}" style="width:84px;padding:0.35rem 0.45rem;border:1px solid #dce6f0;border-radius:8px;">
                <button type="button" id="btnSalvarMetaNotaSaep" class="btn-secondary" style="padding:0.35rem 0.55rem;">Salvar</button>
            </div>
        </div>
        <div class="saep-metric-card">
            <span>Alunos abaixo da meta</span>
            <strong>${alunosAbaixoMetaDiagnosticas}</strong>
        </div>
        <div class="saep-metric-card">
            <span>Execução do plano + etapas</span>
            <strong>${percentualExecucaoGeral}%</strong>
        </div>
    `;

    const btnSalvarMetaNotaSaep = document.getElementById("btnSalvarMetaNotaSaep");
    if (btnSalvarMetaNotaSaep) {
        btnSalvarMetaNotaSaep.onclick = async () => {
            const campoMeta = document.getElementById("saepMetaNotaInput");
            const valorMeta = Number(campoMeta?.value);

            if (!Number.isFinite(valorMeta) || valorMeta < 0 || valorMeta > 10) {
                alert("Informe uma meta válida entre 0 e 10.");
                return;
            }

            salvarMetaNotaSaep(codigoTurma, valorMeta);
            invalidarCacheResumoDashboardSaep(codigoTurma);
            await renderizarResumoPedagogicoSaep(codigoTurma);
        };
    }

    const alertas = [];
    if (!datas.saepObjetivo && !datas.saepPratico) {
        alertas.push("Turma sem data de SAEP cadastrada.");
    }
    if (acoes.length === 0) {
        alertas.push("Sem plano de ação registrado.");
    }
    if (indicadores.mediaTurma !== "-" && Number(indicadores.mediaTurma) < metaEditavel) {
        alertas.push("Média abaixo da meta.");
    }
    if (alunosAbaixoMetaDiagnosticas > 0) {
        alertas.push("Há alunos com desempenho abaixo da meta.");
    }
    if (indicadores.principais.length > 0) {
        alertas.push(`Capacidades críticas recorrentes: ${indicadores.principais.map(([nome]) => nome).join(", ")}.`);
    }

    document.getElementById("saepAlertas").innerHTML = alertas.length > 0
        ? alertas.map((alerta) => `<div class="saep-alert">${alerta}</div>`).join("")
        : `<div class="saep-alert saep-alert--ok">Nenhum alerta identificado.</div>`;

    const painelAnalise = document.getElementById("saepAnaliseImportacao");
    if (painelAnalise) {
        painelAnalise.innerHTML = analiseImportacao
            ? `
                <div class="saep-analysis-panel">
                    <strong>Análise dos dados importados</strong>
                    <div class="saep-analysis-grid">
                        <div><span>Cruzamento</span><strong>${analiseImportacao.totais.cruzamento}</strong></div>
                        <div><span>Itens</span><strong>${analiseImportacao.totais.itens}</strong></div>
                        <div><span>Detalhes</span><strong>${analiseImportacao.totais.detalhes}</strong></div>
                        <div><span>Desempenho individual</span><strong>${analiseImportacao.totais.individual}</strong></div>
                        <div><span>Alunos identificados</span><strong>${analiseImportacao.totalAlunos}</strong></div>
                        <div><span>Média geral importada</span><strong>${analiseImportacao.mediaGeral}</strong></div>
                    </div>
                </div>
            `
            : `<div class="saep-empty-state">Importe uma planilha SAEP para gerar a análise automática.</div>`;
    }

    renderizarResumoNotasSaep(codigoTurma, avaliacoesPratico);
    renderizarResumoCapacidadesSaep(codigoTurma);
    renderizarResumoPlanoSaep(codigoTurma, acoes);
    renderizarResumoDashboardSaep(codigoTurma);
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

function carregarMapaMetaNotaSaep() {
    const dados = carregarTurmasDoStorage(SAEP_META_NOTA_STORAGE_KEY);
    if (!dados || Array.isArray(dados) || typeof dados !== "object") {
        return {};
    }

    return dados;
}

function obterMetaNotaSaep(codigoTurma) {
    const mapa = carregarMapaMetaNotaSaep();
    const valor = Number(mapa[codigoTurma]);

    if (Number.isFinite(valor) && valor >= 0 && valor <= 10) {
        return valor;
    }

    return 7;
}

function salvarMetaNotaSaep(codigoTurma, meta) {
    if (!codigoTurma) {
        return;
    }

    const metaNormalizada = Number(meta);
    if (!Number.isFinite(metaNormalizada) || metaNormalizada < 0 || metaNormalizada > 10) {
        return;
    }

    const mapa = carregarMapaMetaNotaSaep();
    mapa[codigoTurma] = Number(metaNormalizada.toFixed(1));
    salvarTurmasNoStorage(mapa, SAEP_META_NOTA_STORAGE_KEY);
}

function calcularAlunosAbaixoMetaDiagnosticas(diagnosticas, meta) {
    const desempenhoPorAluno = {};

    (diagnosticas || []).forEach(({ detalhes }) => {
        const desempenho = Array.isArray(detalhes?.desempenho) ? detalhes.desempenho : [];

        desempenho.forEach((item) => {
            const nome = String(item?.aluno || "").trim();
            const acerto = Number(item?.acerto || 0);
            const erro = Number(item?.erro || 0);

            if (!nome || acerto < 0 || erro < 0) {
                return;
            }

            const chave = nome.toLowerCase();
            if (!desempenhoPorAluno[chave]) {
                desempenhoPorAluno[chave] = { acertos: 0, erros: 0 };
            }

            desempenhoPorAluno[chave].acertos += acerto;
            desempenhoPorAluno[chave].erros += erro;
        });
    });

    return Object.values(desempenhoPorAluno).reduce((total, aluno) => {
        const questoes = aluno.acertos + aluno.erros;
        if (questoes <= 0) {
            return total;
        }

        const nota = (aluno.acertos / questoes) * 10;
        return total + (nota < meta ? 1 : 0);
    }, 0);
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

    const botaoEditarDataSaep = document.getElementById("btnEditarDataSaep");
    if (botaoEditarDataSaep) {
        botaoEditarDataSaep.onclick = () => abrirModalCadastroSaep(codigoTurma);
    }

    configurarHistoricoSaep(codigoTurma, turma, {
        dataInicio: turma.dataInicio || "",
        totalAcoes: acoes.length,
        totalAvaliacoes: avaliacoesObjetivo.length + avaliacoesPratico.length
    });

    configurarPlataformasSaep(codigoTurma, turma.instrutor);
    configurarImportacaoSaep(codigoTurma);
    exibirAbaSaepDetalhes(obterAbaAtivaSaep(codigoTurma));

    document.querySelectorAll(".saep-sidebar__item").forEach((botao) => {
        botao.onclick = () => {
            const aba = botao.dataset.aba;
            exibirAbaSaepDetalhes(aba);
        };
    });

    const formCadastroDiagnostica = document.getElementById("formCadastroDiagnostica");
    const btnNovaAvaliacaoDiagnostica = document.getElementById("btnNovaAvaliacaoDiagnostica");
    const btnCancelarDiagnostica = document.getElementById("btnCancelarDiagnostica");

    if (btnNovaAvaliacaoDiagnostica) {
        btnNovaAvaliacaoDiagnostica.onclick = () => abrirModalDiagnostica();
    }

    if (btnCancelarDiagnostica) {
        btnCancelarDiagnostica.onclick = () => fecharModalDiagnostica();
    }

    if (formCadastroDiagnostica) {
        formCadastroDiagnostica.onsubmit = (event) => salvarDiagnostica(event, codigoTurma);
    }

    document.getElementById("btnNovaAcao").onclick = () => abrirModalAcaoSaep();

    const btnNovaAvaliacaoObjetivo = document.getElementById("btnNovaAvaliacaoObjetivo");
    if (btnNovaAvaliacaoObjetivo) {
        btnNovaAvaliacaoObjetivo.onclick = () => abrirModalAvaliacaoSaep("objetivo");
    }

    const btnNovaAvaliacaoPratico = document.getElementById("btnNovaAvaliacaoPratico");
    if (btnNovaAvaliacaoPratico) {
        btnNovaAvaliacaoPratico.onclick = () => abrirModalAvaliacaoSaep("pratico");
    }

    renderizarTabelaPlanoSaep(codigoTurma);
    renderizarTabelaAvaliacoesSaep(codigoTurma, "objetivo");
    renderizarTabelaAvaliacoesSaep(codigoTurma, "pratico");
}

function abrirModalDiagnostica() {
    const modal = document.getElementById("modalCadastroDiagnostica");
    const form = document.getElementById("formCadastroDiagnostica");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        const chaveRascunho = obterChaveRascunhoFormulario("formCadastroDiagnostica");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            form.reset();
        } else {
            restaurarRascunhoFormulario("formCadastroDiagnostica", form);
        }
    }
}

function fecharModalDiagnostica() {
    const modal = document.getElementById("modalCadastroDiagnostica");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
}

async function salvarDiagnostica(event, codigoTurma) {
    event.preventDefault();

    const form = document.getElementById("formCadastroDiagnostica");
    const dataAplicacao = document.getElementById("diagnosticaDataAplicacao")?.value?.trim();
    const notaMedia = document.getElementById("diagnosticaNotaMedia")?.value?.trim();
    const capacidadesAvaliadasTexto = document.getElementById("diagnosticaCapacidadesAvaliadas")?.value?.trim() || "";
    const desempenhoAlunosTexto = document.getElementById("diagnosticaDesempenhoAlunos")?.value?.trim() || "";
    const capacidadesCriticasTexto = document.getElementById("diagnosticaCapacidadesCriticas")?.value?.trim() || "";
    const observacao = document.getElementById("diagnosticaObservacao")?.value?.trim() || "";
    const loading = document.getElementById("diagnosticaLoading");
    const salvarButton = form?.querySelector('button[type="submit"]');

    if (!codigoTurma) {
        alert("Selecione uma turma antes de cadastrar a avaliação diagnóstica.");
        return;
    }

    if (!dataAplicacao || !notaMedia || !capacidadesAvaliadasTexto || !desempenhoAlunosTexto || !capacidadesCriticasTexto) {
        alert("Preencha data, nota média, capacidades avaliadas, desempenho dos alunos e capacidades críticas.");
        return;
    }

    if (loading) {
        loading.style.display = "block";
    }

    if (salvarButton) {
        salvarButton.disabled = true;
        salvarButton.textContent = "Salvando...";
    }

    try {
        const capacidadesAvaliadas = parseLinhasDiagnostica(capacidadesAvaliadasTexto).map((campos) => ({
            capacidade: campos[0] || "-",
            nota: campos[1] || "-"
        }));

        const desempenho = parseLinhasDiagnostica(desempenhoAlunosTexto).map((campos) => ({
            aluno: campos[0] || "-",
            capacidade: campos[1] || "-",
            acerto: campos[2] || "-",
            erro: campos[3] || "-"
        }));

        const capacidadesCriticas = parseLinhasDiagnostica(capacidadesCriticasTexto).map((campos) => ({
            capacidade: campos[0] || "-",
            subfuncao: campos[1] || "-",
            conhecimento: campos.length >= 4 ? (campos[2] || "-") : "-",
            percentual_desenvolvimento: campos.length >= 4 ? (campos[3] || "-") : (campos[2] || "-")
        }));

        if (capacidadeListaVazia(capacidadesAvaliadas) || capacidadeListaVazia(desempenho) || capacidadeListaVazia(capacidadesCriticas)) {
            alert("Preencha os campos em linhas válidas no formato indicado.");
            return;
        }

        const diagnosticas = carregarTurmasDoStorage(SAEP_DIAGNOSTICAS_MANUAIS_STORAGE_KEY) || [];
        diagnosticas.push({
            id: `manual-${Date.now()}`,
            codigoTurma,
            origem: "manual",
            data_avaliacao: dataAplicacao,
            nota_media: Number(notaMedia),
            observacao,
            criado_em: new Date().toISOString(),
            detalhes: {
                capacidadesAvaliadas,
                capacidadesCriticas,
                desempenho
            }
        });
        salvarTurmasNoStorage(diagnosticas, SAEP_DIAGNOSTICAS_MANUAIS_STORAGE_KEY);
        invalidarCacheResumoDashboardSaep(codigoTurma);

        limparRascunhoFormulario("formCadastroDiagnostica");
        form.reset();
        fecharModalDiagnostica();
        await renderizarAvaliacoesDiagnosticas(codigoTurma);
        await renderizarAlunosDiagnosticaSaep(codigoTurma);
        alert("Avaliação diagnóstica cadastrada com sucesso.");
    } catch (error) {
        console.error(error);
        alert(error.message || "Não foi possível salvar a avaliação diagnóstica.");
    } finally {
        if (loading) {
            loading.style.display = "none";
        }

        if (salvarButton) {
            salvarButton.disabled = false;
            salvarButton.textContent = "Salvar";
        }
    }
}

async function carregarDetalhesDiagnostica(codigoTurma, diagnosticaId) {
    try {
        const resposta = await fetch(`${DIAGNOSTICAS_API_BASE_URL}/api/turmas/${encodeURIComponent(codigoTurma)}/diagnosticas/${diagnosticaId}/detalhes`);
        if (!resposta.ok) {
            throw new Error("Não foi possível carregar os detalhes da avaliação.");
        }

        return await resposta.json();
    } catch (error) {
        console.error(error);
        return { capacidades: [], itens: [], desempenho: [] };
    }
}

function parseLinhasDiagnostica(texto) {
    return String(texto || "")
        .split("\n")
        .map((linha) => linha.trim())
        .filter(Boolean)
        .map((linha) => linha.split("|").map((campo) => campo.trim()));
}

function capacidadeListaVazia(lista) {
    return !Array.isArray(lista) || lista.length === 0;
}

function obterMapaObservacoesAlunosSaep() {
    const dados = carregarTurmasDoStorage(SAEP_ALUNOS_OBSERVACOES_STORAGE_KEY);
    if (!dados || Array.isArray(dados) || typeof dados !== "object") {
        return {};
    }

    return dados;
}

function obterChaveObservacaoAlunoSaep(linha) {
    return [
        String(linha?.diagnosticaId || "sem-diagnostica"),
        String(linha?.indiceDesempenho ?? "sem-indice"),
        String(linha?.aluno || "sem-aluno").trim().toLowerCase(),
        String(linha?.capacidade || "sem-capacidade").trim().toLowerCase(),
        String(linha?.dataAvaliacao || "sem-data")
    ].join("__");
}

function obterObservacaoAlunoSaep(codigoTurma, chaveObservacao) {
    if (!codigoTurma || !chaveObservacao) {
        return "";
    }

    const mapa = obterMapaObservacoesAlunosSaep();
    const dadosTurma = mapa[codigoTurma];
    if (!dadosTurma || typeof dadosTurma !== "object" || Array.isArray(dadosTurma)) {
        return "";
    }

    return String(dadosTurma[chaveObservacao] || "");
}

function salvarObservacaoAlunoSaep(codigoTurma, chaveObservacao, texto) {
    if (!codigoTurma) {
        return;
    }

    const mapa = obterMapaObservacoesAlunosSaep();
    const dadosTurma = mapa[codigoTurma] && typeof mapa[codigoTurma] === "object" && !Array.isArray(mapa[codigoTurma])
        ? mapa[codigoTurma]
        : {};

    dadosTurma[chaveObservacao] = String(texto || "").trim();
    mapa[codigoTurma] = dadosTurma;
    salvarTurmasNoStorage(mapa, SAEP_ALUNOS_OBSERVACOES_STORAGE_KEY);
}

function obterDiagnosticasManuaisSaep(codigoTurma) {
    const dados = carregarTurmasDoStorage(SAEP_DIAGNOSTICAS_MANUAIS_STORAGE_KEY) || [];
    return dados
        .filter((item) => item?.codigoTurma === codigoTurma)
        .map((item) => ({
            avaliacao: {
                id: item.id,
                data_avaliacao: item.data_avaliacao,
                observacao: item.observacao,
                nota_media: item.nota_media,
                origem: item.origem || "manual"
            },
            detalhes: {
                capacidadesAvaliadas: Array.isArray(item?.detalhes?.capacidadesAvaliadas) ? item.detalhes.capacidadesAvaliadas : [],
                capacidadesCriticas: Array.isArray(item?.detalhes?.capacidadesCriticas) ? item.detalhes.capacidadesCriticas : [],
                desempenho: Array.isArray(item?.detalhes?.desempenho) ? item.detalhes.desempenho : []
            }
        }));
}

async function carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma) {
    const consolidado = [...obterDiagnosticasManuaisSaep(codigoTurma)];

    try {
        const resposta = await fetch(`${DIAGNOSTICAS_API_BASE_URL}/api/turmas/${encodeURIComponent(codigoTurma)}/diagnosticas`);
        if (!resposta.ok) {
            throw new Error("Não foi possível carregar as avaliações diagnósticas da API.");
        }

        const avaliacoesApi = await resposta.json();
        if (Array.isArray(avaliacoesApi) && avaliacoesApi.length > 0) {
            const itensApi = await Promise.all(
                avaliacoesApi.map(async (avaliacao) => {
                    const detalhes = await carregarDetalhesDiagnostica(codigoTurma, avaliacao.id);
                    return {
                        avaliacao,
                        detalhes: {
                            capacidadesAvaliadas: [],
                            capacidadesCriticas: Array.isArray(detalhes?.capacidades) ? detalhes.capacidades : [],
                            itens: Array.isArray(detalhes?.itens) ? detalhes.itens : [],
                            desempenho: Array.isArray(detalhes?.desempenho) ? detalhes.desempenho : []
                        }
                    };
                })
            );

            consolidado.push(...itensApi);
        }
    } catch (error) {
        console.warn("Falha ao carregar diagnósticas da API, mantendo dados locais.", error);
    }

    return consolidado.sort((a, b) => new Date(b?.avaliacao?.data_avaliacao || 0).getTime() - new Date(a?.avaliacao?.data_avaliacao || 0).getTime());
}

function renderizarCardDiagnostica(avaliacao, detalhes) {
    const capacidadesAvaliadas = Array.isArray(detalhes?.capacidadesAvaliadas) ? detalhes.capacidadesAvaliadas : [];
    const capacidadesCriticas = Array.isArray(detalhes?.capacidadesCriticas)
        ? detalhes.capacidadesCriticas
        : (Array.isArray(detalhes?.capacidades) ? detalhes.capacidades : []);
    const itens = Array.isArray(detalhes?.itens) ? detalhes.itens : [];
    const desempenho = Array.isArray(detalhes?.desempenho) ? detalhes.desempenho : [];
    const notaMedia = avaliacao.nota_media ?? "-";
    const dataAplicacao = avaliacao.data_avaliacao ? new Date(avaliacao.data_avaliacao).toLocaleDateString("pt-BR") : "-";
    const observacao = avaliacao.observacao ? avaliacao.observacao : "Sem observação";
    const origem = avaliacao?.origem === "manual" ? "Manual" : "Importado";

    return `
        <article class="saep-diagnostica-card">
            <div class="saep-diagnostica-card__head">
                <div>
                    <strong>Avaliação diagnóstica · ${dataAplicacao}</strong>
                    <div class="saep-diagnostica-card__meta">Nota média: ${notaMedia} · ${observacao}</div>
                </div>
                <span class="saep-badge">${origem}</span>
            </div>
            <details class="saep-diagnostica-details">
                <summary>Ver análise</summary>
                <div class="saep-diagnostica-details__grid">
                    <div>
                        <h4>Capacidades avaliadas</h4>
                        ${capacidadesAvaliadas.length > 0 ? `
                            <table class="saep-diagnostica-table">
                                <thead>
                                    <tr><th>Capacidade</th><th>Nota</th></tr>
                                </thead>
                                <tbody>
                                    ${capacidadesAvaliadas.map((item) => `
                                        <tr>
                                            <td>${item.capacidade || "-"}</td>
                                            <td>${item.nota ?? "-"}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        ` : '<p class="saep-muted">Nenhuma capacidade avaliada informada.</p>'}
                    </div>
                    <div>
                        <h4>Capacidades críticas</h4>
                        ${capacidadesCriticas.length > 0 ? `
                            <table class="saep-diagnostica-table">
                                <thead>
                                    <tr><th>Capacidade</th><th>Subfunção</th><th>Conhecimento</th><th>%</th></tr>
                                </thead>
                                <tbody>
                                    ${capacidadesCriticas.map((item) => `
                                        <tr>
                                            <td>${item.capacidade || "-"}</td>
                                            <td>${item.subfuncao || "-"}</td>
                                            <td>${item.conhecimento || "-"}</td>
                                            <td>${item.percentual_desenvolvimento ?? "-"}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        ` : '<p class="saep-muted">Nenhuma capacidade crítica identificada.</p>'}
                    </div>
                    <div>
                        <h4>Itens com maior erro</h4>
                        ${itens.length > 0 ? `
                            <table class="saep-diagnostica-table">
                                <thead>
                                    <tr><th>Item</th><th>Opção</th><th>%</th></tr>
                                </thead>
                                <tbody>
                                    ${itens.map((item) => `
                                        <tr>
                                            <td>${item.item || "-"}</td>
                                            <td>${item.opcao_mais_errada || "-"}</td>
                                            <td>${item.percentual ?? "-"}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        ` : '<p class="saep-muted">Nenhum item com maior índice de erro foi identificado.</p>'}
                    </div>
                </div>
                <div class="saep-diagnostica-details__grid" style="margin-top: 1rem;">
                    <div>
                        <h4>Desempenho individual</h4>
                        ${desempenho.length > 0 ? `
                            <table class="saep-diagnostica-table">
                                <thead>
                                    <tr><th>Aluno</th><th>Capacidade</th><th>Acerto</th><th>Erro</th></tr>
                                </thead>
                                <tbody>
                                    ${desempenho.map((item) => `
                                        <tr>
                                            <td>${item.aluno || "-"}</td>
                                            <td>${item.capacidade || "-"}</td>
                                            <td>${item.acerto ?? "-"}</td>
                                            <td>${item.erro ?? "-"}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        ` : '<p class="saep-muted">Nenhum registro de desempenho individual foi encontrado.</p>'}
                    </div>
                </div>
            </details>
        </article>
    `;
}

async function renderizarAvaliacoesDiagnosticas(codigoTurma) {
    const container = document.getElementById("saepListaDiagnosticas");
    if (!container) {
        return;
    }

    container.innerHTML = '<div class="saep-empty-state">Carregando avaliações...</div>';

    try {
        const avaliacoes = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
        if (avaliacoes.length === 0) {
            container.innerHTML = '<div class="saep-empty-state">Nenhuma avaliação diagnóstica cadastrada para esta turma.</div>';
            return;
        }

        container.innerHTML = avaliacoes.map((item) => renderizarCardDiagnostica(item.avaliacao, item.detalhes)).join("");
    } catch (error) {
        console.error(error);
        container.innerHTML = '<div class="saep-empty-state">Não foi possível carregar as avaliações diagnósticas no momento.</div>';
    }
}

async function carregarLinhasAlunosDiagnosticaSaep(codigoTurma) {
    const diagnosticas = await carregarAvaliacoesDiagnosticasConsolidadas(codigoTurma);
    if (diagnosticas.length === 0) {
        return [];
    }

    const linhas = [];

    diagnosticas.forEach(({ avaliacao, detalhes }) => {
        const dataAvaliacao = avaliacao?.data_avaliacao || "";
        const notaMedia = avaliacao?.nota_media ?? "-";
        const diagnosticaId = String(avaliacao?.id || "");
        const origem = avaliacao?.origem === "manual" ? "Manual" : "Importado";
        const desempenho = Array.isArray(detalhes?.desempenho) ? detalhes.desempenho : [];

        desempenho.forEach((item, indiceDesempenho) => {
            const nomeAluno = String(item?.aluno || "").trim();
            if (!nomeAluno) {
                return;
            }

            linhas.push({
                aluno: nomeAluno,
                capacidade: item?.capacidade || "-",
                acerto: item?.acerto ?? "-",
                erro: item?.erro ?? "-",
                dataAvaliacao,
                notaMedia,
                diagnosticaId,
                origem,
                indiceDesempenho,
                editavel: origem === "Manual"
            });
        });
    });

    return linhas;
}

function editarRegistroAlunoDiagnosticaSaep(diagnosticaId, indiceDesempenho) {
    const codigoTurma = new URLSearchParams(window.location.search).get("turma") || "";
    if (!codigoTurma) {
        alert("Turma não identificada para edição.");
        return;
    }

    const id = String(diagnosticaId || "").trim();
    const indice = Number(indiceDesempenho);
    if (!id || !Number.isInteger(indice) || indice < 0) {
        alert("Registro inválido para edição.");
        return;
    }

    const diagnosticas = carregarTurmasDoStorage(SAEP_DIAGNOSTICAS_MANUAIS_STORAGE_KEY) || [];
    const indiceDiagnostica = diagnosticas.findIndex((item) => item?.codigoTurma === codigoTurma && String(item?.id || "") === id);
    if (indiceDiagnostica < 0) {
        alert("Somente registros manuais podem ser editados nesta tela.");
        return;
    }

    const desempenho = diagnosticas[indiceDiagnostica]?.detalhes?.desempenho;
    if (!Array.isArray(desempenho) || !desempenho[indice]) {
        alert("Não foi possível localizar os dados deste aluno.");
        return;
    }

    const registroAtual = desempenho[indice] || {};

    const aluno = window.prompt("Aluno:", registroAtual.aluno || "");
    if (aluno === null) {
        return;
    }

    const capacidade = window.prompt("Capacidade:", registroAtual.capacidade || "");
    if (capacidade === null) {
        return;
    }

    const acerto = window.prompt("Acerto:", String(registroAtual.acerto ?? ""));
    if (acerto === null) {
        return;
    }

    const erro = window.prompt("Erro:", String(registroAtual.erro ?? ""));
    if (erro === null) {
        return;
    }

    desempenho[indice] = {
        ...registroAtual,
        aluno: aluno.trim() || "-",
        capacidade: capacidade.trim() || "-",
        acerto: acerto.trim() || "-",
        erro: erro.trim() || "-"
    };

    salvarTurmasNoStorage(diagnosticas, SAEP_DIAGNOSTICAS_MANUAIS_STORAGE_KEY);
    renderizarAvaliacoesDiagnosticas(codigoTurma);
    renderizarAlunosDiagnosticaSaep(codigoTurma);
}

async function renderizarAlunosDiagnosticaSaep(codigoTurma) {
    const container = document.getElementById("saepListaAlunosDiagnostica");
    if (!container) {
        return;
    }

    container.innerHTML = '<div class="saep-empty-state">Carregando alunos...</div>';

    try {
        const linhas = await carregarLinhasAlunosDiagnosticaSaep(codigoTurma);

        container.innerHTML = `
            <div class="table-scroll">
                <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th>Capacidade</th>
                            <th>Acerto</th>
                            <th>Erro</th>
                            <th>Data</th>
                            <th>Nota média</th>
                            <th>Origem</th>
                            <th>Observações</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas.length === 0 ? `
                            <tr>
                                <td colspan="9">Cadastre uma avaliação diagnóstica para preencher esta aba com os alunos.</td>
                            </tr>
                        ` : linhas.map((linha) => `
                            <tr>
                                <td>${linha.aluno}</td>
                                <td>${linha.capacidade}</td>
                                <td>${linha.acerto}</td>
                                <td>${linha.erro}</td>
                                <td>${linha.dataAvaliacao ? new Date(linha.dataAvaliacao).toLocaleDateString("pt-BR") : "-"}</td>
                                <td>${linha.notaMedia}</td>
                                <td>${linha.origem}</td>
                                <td>
                                    <button type="button" class="btn-edit" title="Cadastrar observação do aluno" onclick="editarObservacaoAlunoSaep('${codigoTurma}', '${obterChaveObservacaoAlunoSaep(linha)}')">✏️</button>
                                    <span class="saep-observacao-preview">${obterObservacaoAlunoSaep(codigoTurma, obterChaveObservacaoAlunoSaep(linha)) || "Sem observação"}</span>
                                </td>
                                <td>
                                    ${linha.editavel
            ? `<button type="button" class="btn-edit" title="Editar ações do registro do aluno" onclick="editarRegistroAlunoDiagnosticaSaep('${linha.diagnosticaId}', ${linha.indiceDesempenho})">✏️</button>`
            : "-"}
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error(error);
        container.innerHTML = '<div class="saep-empty-state">Não foi possível carregar os alunos no momento.</div>';
    }
}

function editarObservacaoAlunoSaep(codigoTurma, chaveObservacao) {
    if (!codigoTurma || !chaveObservacao) {
        return;
    }

    const observacaoAtual = obterObservacaoAlunoSaep(codigoTurma, chaveObservacao);
    const novaObservacao = window.prompt("Digite a observação deste aluno:", observacaoAtual);
    if (novaObservacao === null) {
        return;
    }

    salvarObservacaoAlunoSaep(codigoTurma, chaveObservacao, novaObservacao);
    renderizarAlunosDiagnosticaSaep(codigoTurma);
}

async function buscarPlanosDaTurmaApi(codigoTurma) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const acoes = (carregarTurmasDoStorage("saepAcoes") || [])
                .filter((item) => item.codigoTurma === codigoTurma)
                .map((item) => ({
                    ...item,
                    andamento: item.andamento || item.status || "A iniciar",
                    status: item.status || item.andamento || "A iniciar"
                }));

            planosResumoSaepPorTurma[codigoTurma] = acoes;
            resolve(acoes);
        }, 120);
    });
}

async function salvarPlanoDaTurmaApi(codigoTurma, plano) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const acoes = carregarTurmasDoStorage("saepAcoes") || [];
            const andamento = plano.andamento || plano.status || "A iniciar";
            const planoPersistido = {
                ...plano,
                codigoTurma,
                andamento,
                status: andamento,
                data: plano.data || ""
            };

            const indice = acoes.findIndex((item) => item.id === planoPersistido.id);
            if (indice >= 0) {
                acoes[indice] = planoPersistido;
            } else {
                acoes.push(planoPersistido);
            }

            salvarTurmasNoStorage(acoes, "saepAcoes");
            planosResumoSaepPorTurma[codigoTurma] = acoes
                .filter((item) => item.codigoTurma === codigoTurma)
                .map((item) => ({
                    ...item,
                    andamento: item.andamento || item.status || "A iniciar",
                    status: item.status || item.andamento || "A iniciar"
                }));
            invalidarCacheResumoDashboardSaep(codigoTurma);
            resolve(planoPersistido);
        }, 120);
    });
}

function renderizarTabelaPlanoSaep(codigoTurma) {
    const container = document.getElementById("saepTabelaPlano");
    const analiseImportacao = obterUltimaAnaliseImportacaoSaep(codigoTurma);

    if (!container) {
        return;
    }

    container.innerHTML = '<div class="saep-empty-state">Carregando planos de ação...</div>';

    buscarPlanosDaTurmaApi(codigoTurma).then((acoes) => {
        container.innerHTML = `
            ${analiseImportacao ? `
                <div class="saep-analysis-panel saep-analysis-panel--compact">
                    <strong>Sugestões automáticas do plano</strong>
                    <ul class="saep-analysis-list">
                        ${analiseImportacao.sugestoesPlano.map((item) => `<li>${item}</li>`).join("")}
                    </ul>
                </div>
            ` : ''}
            <div class="table-scroll">
                <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                    <thead>
                        <tr>
                            <th>Título</th>
                            <th>Responsável</th>
                            <th>Andamento</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${acoes.length === 0 ? '<tr><td colspan="4">Nenhum plano de ação cadastrado.</td></tr>' : acoes.map((acao) => `
                            <tr>
                                <td>${acao.titulo || "-"}</td>
                                <td>${acao.responsavel || "-"}</td>
                                <td>${acao.andamento || acao.status || "A iniciar"}</td>
                                <td>
                                    <button type="button" class="btn-edit" onclick="abrirModalAcaoSaep('${acao.id}')" title="Editar plano">✏️</button>
                                    <button type="button" class="btn-delete" onclick="excluirAcaoSaep('${acao.id}')" title="Excluir plano">🗑️</button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    });
}

function abrirModalAcaoSaep(id = "") {
    const modal = document.getElementById("modalCadastroAcaoSaep");
    const form = document.getElementById("formCadastroAcaoSaep");
    const titulo = document.getElementById("tituloModalAcaoSaep");
    const idInput = document.getElementById("acaoIdSaep");
    const turmaInput = document.getElementById("acaoTurmaSaep");
    const campoParaTodasTurmas = document.getElementById("acaoParaTodasTurmasSaep");
    const params = new URLSearchParams(window.location.search);
    const codigoTurma = params.get("turma");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        const chaveRascunho = obterChaveRascunhoFormulario("formCadastroAcaoSaep");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            form.reset();
        } else {
            restaurarRascunhoFormulario("formCadastroAcaoSaep", form);
        }
    }

    if (titulo) {
        titulo.textContent = id ? "Editar plano de ação" : "Cadastrar plano de ação";
    }

    if (idInput) {
        idInput.value = id;
    }

    if (turmaInput) {
        turmaInput.value = codigoTurma || "";
    }

    if (campoParaTodasTurmas) {
        campoParaTodasTurmas.checked = false;
        campoParaTodasTurmas.disabled = Boolean(id);
    }

    if (id) {
        const acoes = (carregarTurmasDoStorage("saepAcoes") || []).find((item) => item.id === id);
        if (acoes) {
            document.getElementById("acaoTituloSaep").value = acoes.titulo || "";
            document.getElementById("acaoResponsavelSaep").value = acoes.responsavel || "";
            document.getElementById("acaoStatusSaep").value = acoes.andamento || acoes.status || "A iniciar";
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
    const titulo = document.getElementById("acaoTituloSaep").value.trim();
    const responsavel = document.getElementById("acaoResponsavelSaep").value.trim();
    const descricao = document.getElementById("acaoDescricaoSaep").value.trim();
    const andamento = document.getElementById("acaoStatusSaep").value;
    const paraTodasTurmas = Boolean(document.getElementById("acaoParaTodasTurmasSaep")?.checked) && !id;
    const acao = {
        id: id || `${Date.now()}`,
        codigoTurma,
        titulo,
        responsavel,
        andamento,
        status: andamento,
        descricao,
        data: ""
    };

    if (!titulo || !responsavel || !descricao) {
        alert("Preencha título, responsável e descrição antes de salvar.");
        return;
    }

    if (paraTodasTurmas) {
        const turmas = carregarTurmasDoStorage(STORAGE_KEY) || [];

        if (turmas.length === 0) {
            alert("Nenhuma turma cadastrada para aplicar o plano.");
            return;
        }

        const idBase = Date.now();
        const salvamentos = turmas.map((turma, indice) => {
            const codigoTurmaDestino = String(turma?.codigoTurma || "").trim();
            if (!codigoTurmaDestino) {
                return null;
            }

            return salvarPlanoDaTurmaApi(codigoTurmaDestino, {
                ...acao,
                id: `${idBase}-${indice}`,
                codigoTurma: codigoTurmaDestino
            });
        }).filter(Boolean);

        Promise.all(salvamentos).then(() => {
            limparRascunhoFormulario("formCadastroAcaoSaep");
            fecharModalAcaoSaep();
            renderizarDetalhesSaep();
            alert("Plano de ação aplicado em todas as turmas.");
        });
        return;
    }

    salvarPlanoDaTurmaApi(codigoTurma, acao).then(() => {
        limparRascunhoFormulario("formCadastroAcaoSaep");
        fecharModalAcaoSaep();
        renderizarDetalhesSaep();
    });
}

function excluirAcaoSaep(id) {
    const acoesAtuais = carregarTurmasDoStorage("saepAcoes") || [];
    const acaoRemovida = acoesAtuais.find((item) => item.id === id);
    const acoes = acoesAtuais.filter((item) => item.id !== id);
    salvarTurmasNoStorage(acoes, "saepAcoes");

    if (acaoRemovida?.codigoTurma) {
        invalidarCacheResumoDashboardSaep(acaoRemovida.codigoTurma);
    } else {
        invalidarCacheResumoDashboardSaep();
    }

    renderizarDetalhesSaep();
}

function abrirModalAvaliacaoSaep(tipo = "objetivo") {
    const modal = document.getElementById("modalCadastroAvaliacaoSaep");
    const form = document.getElementById("formCadastroAvaliacaoSaep");
    const titulo = document.getElementById("tituloModalAvaliacaoSaep");
    const tipoInput = document.getElementById("avaliacaoTipoSaep");
    const turmaInput = document.getElementById("avaliacaoTurmaSaep");
    const grupoAlunos = document.getElementById("avaliacaoGrupoAlunosSaep");
    const grupoCapacidades = document.getElementById("avaliacaoGrupoCapacidadesSaep");
    const grupoImportacaoObjetivo = document.getElementById("avaliacaoImportacaoObjetivo");
    const params = new URLSearchParams(window.location.search);
    const codigoTurma = params.get("turma");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    if (form) {
        const chaveRascunho = obterChaveRascunhoFormulario("formCadastroAvaliacaoSaep");
        const temRascunho = Boolean(localStorage.getItem(chaveRascunho));

        if (!temRascunho) {
            form.reset();
        } else {
            restaurarRascunhoFormulario("formCadastroAvaliacaoSaep", form);
        }
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

    const ehObjetivo = tipo === "objetivo";
    if (grupoAlunos) {
        grupoAlunos.style.display = ehObjetivo ? "none" : "block";
    }
    if (grupoCapacidades) {
        grupoCapacidades.style.display = ehObjetivo ? "none" : "block";
    }
    if (grupoImportacaoObjetivo) {
        grupoImportacaoObjetivo.style.display = ehObjetivo ? "block" : "none";
    }

    if (ehObjetivo && codigoTurma) {
        configurarImportacaoSaep(codigoTurma);
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
        alunosBaixoDesempenho: tipo === "pratico" ? (document.getElementById("avaliacaoAlunosSaep").value || "").split("\n").filter(Boolean).map((linha) => {
            const [nome, nota, capacidades] = linha.split("|").map((item) => item.trim());
            return { nome, nota, capacidades };
        }) : [],
        capacidades: tipo === "pratico" ? (document.getElementById("avaliacaoCapacidadesSaep").value || "").split("\n").filter(Boolean).map((linha) => {
            const [capacidade, nota, situacao] = linha.split("|").map((item) => item.trim());
            return { capacidade, nota, situacao: situacao || "atenção" };
        }) : []
    };

    const storageKey = tipo === "pratico" ? "saepAvaliacoesPratico" : "saepAvaliacoesObjetivo";
    const avaliacoes = carregarTurmasDoStorage(storageKey) || [];
    avaliacoes.push(avaliacao);
    salvarTurmasNoStorage(avaliacoes, storageKey);
    limparRascunhoFormulario("formCadastroAvaliacaoSaep");
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

function carregarPlanosAcaoEscolaSaep() {
    const dados = carregarTurmasDoStorage(SAEP_PLANO_ACAO_ESCOLA_STORAGE_KEY);
    return Array.isArray(dados) ? dados.filter(Boolean) : [];
}

function salvarPlanosAcaoEscolaSaep(planos) {
    salvarTurmasNoStorage(Array.isArray(planos) ? planos : [], SAEP_PLANO_ACAO_ESCOLA_STORAGE_KEY);
}

function renderizarPlanosAcaoEscolaSaep() {
    const corpoTabela = document.getElementById("tabelaPlanoAcaoEscolaSaep");
    if (!corpoTabela) {
        return;
    }

    const planos = carregarPlanosAcaoEscolaSaep()
        .slice()
        .sort((a, b) => new Date(b.data || b.criadoEm || 0).getTime() - new Date(a.data || a.criadoEm || 0).getTime());

    if (planos.length === 0) {
        corpoTabela.innerHTML = '<tr><td colspan="4">Nenhum plano de ação da escola cadastrado.</td></tr>';
        return;
    }

    corpoTabela.innerHTML = planos.map((plano) => `
        <tr>
            <td>${plano.data ? formatarDataParaExibirSaep(plano.data) : "-"}</td>
            <td>${plano.titulo || "-"}</td>
            <td>${plano.descricao || "-"}</td>
            <td>
                <button type="button" class="btn-edit" title="Editar plano da escola" onclick="editarPlanoAcaoEscolaSaep('${plano.id}')">✏️</button>
                <button type="button" class="btn-delete" title="Excluir plano da escola" onclick="excluirPlanoAcaoEscolaSaep('${plano.id}')">🗑️</button>
            </td>
        </tr>
    `).join("");
}

function editarPlanoAcaoEscolaSaep(planoId) {
    const id = String(planoId || "").trim();
    if (!id) {
        return;
    }

    const plano = carregarPlanosAcaoEscolaSaep().find((item) => String(item?.id || "") === id);
    if (!plano) {
        return;
    }

    const modal = document.getElementById("modalPlanoAcaoEscolaSaep");
    const tituloModal = document.getElementById("tituloModalPlanoAcaoEscolaSaep");
    const campoId = document.getElementById("planoAcaoEscolaSaepId");
    const campoData = document.getElementById("planoAcaoEscolaSaepData");
    const campoTitulo = document.getElementById("planoAcaoEscolaSaepTitulo");
    const campoDescricao = document.getElementById("planoAcaoEscolaSaepDescricao");

    if (!modal || !campoId || !campoData || !campoTitulo || !campoDescricao) {
        return;
    }

    campoId.value = plano.id;
    campoData.value = plano.data || "";
    campoTitulo.value = plano.titulo || "";
    campoDescricao.value = plano.descricao || "";
    if (tituloModal) {
        tituloModal.textContent = "Editar plano de ação da escola";
    }

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
}

function excluirPlanoAcaoEscolaSaep(planoId) {
    const id = String(planoId || "").trim();
    if (!id) {
        return;
    }

    const confirmou = window.confirm("Deseja realmente excluir este plano de ação da escola?");
    if (!confirmou) {
        return;
    }

    const atualizados = carregarPlanosAcaoEscolaSaep().filter((item) => String(item?.id || "") !== id);
    salvarPlanosAcaoEscolaSaep(atualizados);
    renderizarPlanosAcaoEscolaSaep();
}

function fecharModalPlanoAcaoEscolaSaep() {
    const modal = document.getElementById("modalPlanoAcaoEscolaSaep");
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function configurarPlanoAcaoEscolaSaep() {
    const botaoCadastrar = document.getElementById("btnCadastrarPlanoAcaoEscola");
    const modal = document.getElementById("modalPlanoAcaoEscolaSaep");
    const form = document.getElementById("formPlanoAcaoEscolaSaep");
    const botaoCancelar = document.getElementById("btnCancelarPlanoAcaoEscolaSaep");
    const tituloModal = document.getElementById("tituloModalPlanoAcaoEscolaSaep");
    const campoId = document.getElementById("planoAcaoEscolaSaepId");
    const campoData = document.getElementById("planoAcaoEscolaSaepData");
    const campoTitulo = document.getElementById("planoAcaoEscolaSaepTitulo");
    const campoDescricao = document.getElementById("planoAcaoEscolaSaepDescricao");

    if (!botaoCadastrar || !modal || !form || !botaoCancelar || !campoId || !campoData || !campoTitulo || !campoDescricao) {
        return;
    }

    botaoCadastrar.onclick = () => {
        form.reset();
        campoId.value = "";
        if (tituloModal) {
            tituloModal.textContent = "Cadastrar plano de ação da escola";
        }
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    };

    botaoCancelar.onclick = fecharModalPlanoAcaoEscolaSaep;
    modal.onclick = (event) => {
        if (event.target === modal) {
            fecharModalPlanoAcaoEscolaSaep();
        }
    };

    form.onsubmit = (event) => {
        event.preventDefault();

        const id = campoId.value.trim();
        const data = campoData.value.trim();
        const titulo = campoTitulo.value.trim();
        const descricao = campoDescricao.value.trim();

        if (!data || !titulo || !descricao) {
            alert("Preencha data, título e descrição do plano de ação da escola.");
            return;
        }

        const planos = carregarPlanosAcaoEscolaSaep();
        if (id) {
            const indice = planos.findIndex((item) => String(item?.id || "") === id);
            if (indice >= 0) {
                planos[indice] = {
                    ...planos[indice],
                    id,
                    data,
                    titulo,
                    descricao
                };
            }
        } else {
            planos.push({
                id: `${Date.now()}`,
                data,
                titulo,
                descricao,
                criadoEm: new Date().toISOString()
            });
        }

        salvarPlanosAcaoEscolaSaep(planos);
        limparRascunhoFormulario("formPlanoAcaoEscolaSaep");
        fecharModalPlanoAcaoEscolaSaep();
        form.reset();
        campoId.value = "";
        if (tituloModal) {
            tituloModal.textContent = "Cadastrar plano de ação da escola";
        }
        renderizarPlanosAcaoEscolaSaep();
    };
}

function mostrarAbaPrincipalSaep(aba) {
    const abaNormalizada = aba === "plano-escola" ? "plano-escola" : "turmas";
    const blocoTurmas = document.getElementById("saepMainAbaTurmas");
    const blocoPlanoEscola = document.getElementById("saepMainAbaPlanoEscola");

    document.querySelectorAll("[data-saep-main-aba]").forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.saepMainAba === abaNormalizada);
    });

    if (blocoTurmas) {
        blocoTurmas.style.display = abaNormalizada === "turmas" ? "block" : "none";
    }

    if (blocoPlanoEscola) {
        blocoPlanoEscola.style.display = abaNormalizada === "plano-escola" ? "block" : "none";
    }

    salvarValorPersistente(SAEP_PAGINA_PRINCIPAL_ABA_STORAGE, abaNormalizada);
}

function configurarSubmenuPaginaPrincipalSaep() {
    const botoes = document.querySelectorAll("[data-saep-main-aba]");
    if (!botoes.length) {
        return;
    }

    botoes.forEach((botao) => {
        botao.onclick = () => mostrarAbaPrincipalSaep(botao.dataset.saepMainAba || "turmas");
    });

    const abaSalva = obterValorPersistente(SAEP_PAGINA_PRINCIPAL_ABA_STORAGE) || "turmas";
    mostrarAbaPrincipalSaep(abaSalva);
}

function renderizarTurmasSaep() {
    const tabela = document.getElementById("tabelaTurmasSaep");
    const painel = document.getElementById("painelSaepDetalhes");
    const conteudo = document.getElementById("conteudoSaep");
    const botaoCadastrarRegistros = document.getElementById("btnCadastrarRegistrosSaep");
    const containerRegistros = document.getElementById("saepRegistrosGestao");
    const badgeTotalRegistros = document.getElementById("saepTotalRegistrosBadge");

    if (!tabela) {
        return;
    }

    const corpo = tabela.querySelector("tbody");
    if (!corpo) {
        return;
    }

    corpo.innerHTML = "";

    if (painel) {
        painel.style.display = "block";
    }

    if (conteudo) {
        conteudo.innerHTML = "";
    }

    configurarRegistrosSaepPrincipal(botaoCadastrarRegistros, containerRegistros, badgeTotalRegistros);
    configurarSubmenuPaginaPrincipalSaep();
    configurarPlanoAcaoEscolaSaep();
    renderizarPlanosAcaoEscolaSaep();

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
            <td>${formatarPeriodoPraticoSaepTexto(registro)}</td>
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

function carregarRegistrosSaepGestao() {
    const dados = carregarTurmasDoStorage("saepRegistrosGestao");
    return Array.isArray(dados) ? dados.filter(Boolean) : [];
}

function salvarRegistrosSaepGestao(registros) {
    salvarTurmasNoStorage(Array.isArray(registros) ? registros : [], "saepRegistrosGestao");
}

function renderizarRegistrosSaepGestao(container, badge) {
    if (!container) {
        return;
    }

    const registros = carregarRegistrosSaepGestao().sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());

    if (badge) {
        badge.textContent = `${registros.length} registro${registros.length === 1 ? "" : "s"}`;
    }

    if (registros.length === 0) {
        container.innerHTML = '<div class="saep-empty-state">Nenhum registro cadastrado ainda. Use o botão acima para criar o primeiro.</div>';
        return;
    }

    container.innerHTML = `
        <div class="saep-registros-list-wrapper">
            <h4 class="saep-registros-list-title">Lembretes cadastrados</h4>
            <ul class="saep-registros-topicos">
                ${registros.map((registro) => `
                    <li class="saep-registro-item">
                        <div class="saep-registro-item__head">
                            <strong>${registro.titulo}</strong>
                            <button type="button" class="btn-delete" title="Excluir lembrete" onclick="excluirRegistroSaepGestao('${registro.id}')">🗑️</button>
                        </div>
                        <p class="saep-registro-item__descricao">${registro.descricao}</p>
                    </li>
                `).join("")}
            </ul>
        </div>
    `;
}

function excluirRegistroSaepGestao(idRegistro) {
    const id = String(idRegistro || "").trim();
    if (!id) {
        return;
    }

    const confirmou = window.confirm("Deseja realmente excluir este lembrete?");
    if (!confirmou) {
        return;
    }

    const registros = carregarRegistrosSaepGestao();
    const atualizados = registros.filter((registro) => String(registro?.id || "") !== id);
    salvarRegistrosSaepGestao(atualizados);

    const container = document.getElementById("saepRegistrosGestao");
    const badge = document.getElementById("saepTotalRegistrosBadge");
    renderizarRegistrosSaepGestao(container, badge);
}

function configurarRegistrosSaepPrincipal(botao, container, badge) {
    const modal = document.getElementById("modalRegistroSaep");
    const form = document.getElementById("formRegistroSaep");
    const campoTitulo = document.getElementById("registroTituloSaep");
    const campoDescricao = document.getElementById("registroDescricaoSaep");
    const botaoCancelar = document.getElementById("btnCancelarRegistroSaep");

    if (!botao || !container || !badge || !modal || !form || !campoTitulo || !campoDescricao || !botaoCancelar) {
        renderizarRegistrosSaepGestao(container, badge);
        return;
    }

    renderizarRegistrosSaepGestao(container, badge);

    botao.onclick = () => {
        form.reset();
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    };

    botaoCancelar.onclick = () => {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    };

    form.onsubmit = (event) => {
        event.preventDefault();

        const titulo = campoTitulo.value.trim();
        const descricao = campoDescricao.value.trim();

        if (!titulo || !descricao) {
            alert("Preencha todos os campos do registro SAEP.");
            return;
        }

        const registros = carregarRegistrosSaepGestao();
        registros.push({
            id: `${Date.now()}`,
            titulo,
            descricao,
            criadoEm: new Date().toISOString()
        });

        salvarRegistrosSaepGestao(registros);
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
        renderizarRegistrosSaepGestao(container, badge);
        form.reset();
    };

    modal.onclick = (event) => {
        if (event.target === modal) {
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden", "true");
        }
    };
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
        if (aba === "historico") {
            conteudo.innerHTML = "<p>Selecione uma turma para acessar o histórico escolar do SAEP.</p>";
            return;
        }

        conteudo.innerHTML = "<p>Selecione uma turma.</p>";
        return;
    }

    let texto = "";
    if (aba === "historico") {
        texto = `<h3>Histórico</h3><p>Abra a turma ${turma.codigoTurma} para consultar e registrar o histórico escolar completo.</p>`;
    } else if (aba === "plano") {
        texto = `<h3>Plano de ação</h3><p>Registrar ações pedagógicas para a turma ${turma.codigoTurma}.</p>`;
    } else if (aba === "objetivos") {
        texto = `<h3>Avaliações objetivas</h3><p>Organizar as avaliações objetivas da turma ${turma.codigoTurma}.</p>`;
    } else if (aba === "praticos") {
        texto = `<h3>Avaliação prática</h3><p>Organizar as avaliações práticas da turma ${turma.codigoTurma}.</p>`;
    }

    conteudo.innerHTML = `
        <p><strong>Turma:</strong> ${turma.codigoTurma}</p>
        <p><strong>Curso:</strong> ${turma.curso}</p>
        <p><strong>Instrutor:</strong> ${turma.instrutor}</p>
        ${texto}
    `;
}

function excluirAlunoDaTurma(codigoTurma, nomeAluno) {
    const nomeNormalizado = String(nomeAluno || "").trim().toLowerCase();
    if (!nomeNormalizado) {
        return;
    }

    const confirmacao = window.confirm(`Deseja realmente excluir o nome ${nomeAluno} desta turma?`);
    if (!confirmacao) {
        return;
    }

    const alunosExistentes = carregarAlunosDaTurma(codigoTurma);
    const alunosAtualizados = alunosExistentes.filter((aluno) => String(aluno || "").trim().toLowerCase() !== nomeNormalizado);

    const ocorrencias = carregarOcorrenciasDaTurma(codigoTurma).filter((item) => String(item?.aluno || "").trim().toLowerCase() !== nomeNormalizado);

    salvarAlunosDaTurma(codigoTurma, alunosAtualizados);
    salvarOcorrenciasDaTurma(codigoTurma, ocorrencias);
    renderizarDetalhesTurmaNaPagina();
}

function renderizarDetalhesTurmaNaPagina() {
    const codigoTurmaParam = new URLSearchParams(window.location.search).get("turma");
    const codigoTurmaSalvo = obterValorPersistente(ULTIMA_TURMA_OCORRENCIA_SESSION_STORAGE);
    const codigoTurma = (codigoTurmaParam || codigoTurmaSalvo || "").trim();
    const titulo = document.getElementById("tituloTurmaOcorrencia");
    const dadosTurma = document.getElementById("dadosTurmaOcorrencia");
    const containerAlunos = document.getElementById("listaAlunosOcorrencia");
    const containerOcorrenciasTurma = document.getElementById("listaOcorrenciasTurma");
    const botaoCadastrar = document.getElementById("btnCadastrarAlunos");
    const botaoCadastrarOcorrenciaTurma = document.getElementById("btnCadastrarOcorrenciaTurma");
    const campoCodigo = document.getElementById("codigoTurmaOcorrencia");

    if (!titulo || !dadosTurma || !containerAlunos || !containerOcorrenciasTurma || !botaoCadastrar || !botaoCadastrarOcorrenciaTurma || !campoCodigo) {
        return;
    }

    if (!codigoTurma) {
        titulo.textContent = "Turma não selecionada";
        dadosTurma.textContent = "Volte para a lista de turmas e selecione uma turma.";
        containerAlunos.innerHTML = "";
        return;
    }

    salvarValorPersistente(ULTIMA_TURMA_OCORRENCIA_SESSION_STORAGE, codigoTurma);

    const turma = obterTurmaPorCodigo(codigoTurma);
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
    botaoCadastrarOcorrenciaTurma.onclick = () => abrirModalOcorrenciaTurma(codigoTurma);

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
        const ocorrenciasAluno = ocorrencias.filter((item) => item.aluno.trim() === aluno.trim());
        card.className = `student-card${ocorrenciasAluno.length > 0 ? " student-card--has-occurrence" : ""}`;

        card.innerHTML = `
            <div class="student-card__header">
                <div class="student-card__title">
                    <strong>${aluno}</strong>
                    ${ocorrenciasAluno.length > 0 ? `<span class="student-card__badge">${ocorrenciasAluno.length} ocorrência${ocorrenciasAluno.length > 1 ? "s" : ""}</span>` : '<span class="student-card__badge student-card__badge--muted">Sem ocorrências</span>'}
                </div>
                <div class="student-card__actions">
                    <button type="button" class="btn-secondary student-card__button student-card__icon-button" title="Editar ocorrência" aria-label="Editar ocorrência" data-editar-ocorrencia="${aluno}">✏️</button>
                    <button type="button" class="btn-delete student-card__button student-card__icon-button" title="Excluir nome" aria-label="Excluir nome" data-excluir-aluno="${aluno}">🗑️</button>
                    <button type="button" class="btn-primary student-card__button">Cadastrar ocorrência</button>
                </div>
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

        const botao = card.querySelector("button.btn-primary");
        botao.addEventListener("click", () => abrirModalOcorrencia(codigoTurma, aluno));

        const botaoEditar = card.querySelector("button[data-editar-ocorrencia]");
        botaoEditar?.addEventListener("click", () => {
            const ocorrenciaSelecionada = ocorrenciasAluno[ocorrenciasAluno.length - 1] || null;
            abrirModalOcorrencia(codigoTurma, aluno, ocorrenciaSelecionada);
        });

        const botaoExcluir = card.querySelector("button[data-excluir-aluno]");
        botaoExcluir?.addEventListener("click", () => excluirAlunoDaTurma(codigoTurma, aluno));

        fragmento.appendChild(card);
    });

    containerAlunos.appendChild(fragmento);

    renderizarOcorrenciasGeraisTurmaNaPagina(codigoTurma);
    configurarAbasOcorrenciasTurma(codigoTurma);
    mostrarAbaOcorrenciasTurma(codigoTurma, obterAbaOcorrenciasTurma(codigoTurma));
}

function configurarAbasOcorrenciasTurma(codigoTurma) {
    document.querySelectorAll("[data-aba-ocorrencia]").forEach((botao) => {
        botao.onclick = () => {
            mostrarAbaOcorrenciasTurma(codigoTurma, botao.dataset.abaOcorrencia || "alunos");
        };
    });
}

function mostrarAbaOcorrenciasTurma(codigoTurma, aba) {
    const abaNormalizada = aba === "turma" ? "turma" : "alunos";
    const containerAlunos = document.getElementById("listaAlunosOcorrencia");
    const containerOcorrenciasTurma = document.getElementById("listaOcorrenciasTurma");
    const botaoCadastrarAlunos = document.getElementById("btnCadastrarAlunos");
    const botaoCadastrarOcorrenciaTurma = document.getElementById("btnCadastrarOcorrenciaTurma");

    document.querySelectorAll("[data-aba-ocorrencia]").forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.abaOcorrencia === abaNormalizada);
    });

    if (containerAlunos) {
        containerAlunos.style.display = abaNormalizada === "alunos" ? "block" : "none";
    }

    if (containerOcorrenciasTurma) {
        containerOcorrenciasTurma.style.display = abaNormalizada === "turma" ? "block" : "none";
    }

    if (botaoCadastrarAlunos) {
        botaoCadastrarAlunos.style.display = abaNormalizada === "alunos" ? "inline-flex" : "none";
    }

    if (botaoCadastrarOcorrenciaTurma) {
        botaoCadastrarOcorrenciaTurma.style.display = abaNormalizada === "turma" ? "inline-flex" : "none";
    }

    salvarAbaOcorrenciasTurma(codigoTurma, abaNormalizada);
}

function renderizarOcorrenciasGeraisTurmaNaPagina(codigoTurma) {
    const container = document.getElementById("listaOcorrenciasTurma");
    if (!container) {
        return;
    }

    const ocorrencias = carregarOcorrenciasGeraisDaTurma(codigoTurma)
        .slice()
        .sort((a, b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime());

    container.innerHTML = `
        <div class="saep-card">
            <div class="saep-card__header">
                <h3>Ocorrências da turma</h3>
            </div>
            <div class="table-scroll">
                <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo de ocorrência</th>
                            <th>Ocorrência</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ocorrencias.length === 0 ? '<tr><td colspan="4">Nenhuma ocorrência da turma cadastrada.</td></tr>' : ocorrencias.map((item) => `
                            <tr>
                                <td>${item.data ? formatarDataParaExibir(item.data) : "-"}</td>
                                <td>${item.tipo || "-"}</td>
                                <td>${item.descricao || "-"}</td>
                                <td>
                                    <button type="button" class="btn-edit" title="Editar ocorrência da turma" onclick="abrirModalOcorrenciaTurma('${codigoTurma}', '${item.id}')">✏️</button>
                                    <button type="button" class="btn-delete" title="Excluir ocorrência da turma" onclick="excluirOcorrenciaTurma('${codigoTurma}', '${item.id}')">🗑️</button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function cadastrarAlunosDaTurma(codigoTurma) {
    const nome = window.prompt("Digite os nomes dos alunos separados por vírgula:");
    if (!nome) {
        return;
    }

    const alunosNovos = nome
        .split(/[,;\n\r\t]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    if (alunosNovos.length === 0) {
        return;
    }

    const alunosExistentes = carregarAlunosDaTurma(codigoTurma);
    const alunosUnicos = Array.from(new Map([...alunosExistentes, ...alunosNovos].map((aluno) => [aluno.toLowerCase(), aluno])).values());
    salvarAlunosDaTurma(codigoTurma, alunosUnicos);
    renderizarDetalhesTurmaNaPagina();
}

function abrirModalOcorrencia(codigoTurma, alunoNome = "", ocorrencia = null) {
    const modal = document.getElementById("modalOcorrencia");
    const titulo = document.getElementById("modalTituloOcorrencia");
    const campoCodigo = document.getElementById("codigoTurmaOcorrencia");
    const campoAluno = document.getElementById("alunoOcorrencia");
    const nomeAluno = document.getElementById("nomeAlunoOcorrencia");
    const descricao = document.getElementById("descricaoOcorrencia");
    const campoId = document.getElementById("ocorrenciaIdEdicao");
    const selectTipo = document.getElementById("tipoOcorrencia");

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

    if (campoId) {
        campoId.value = ocorrencia?.id || "";
    }

    if (titulo) {
        titulo.textContent = ocorrencia ? `Editar ocorrência - ${alunoNome}` : (alunoNome ? `Registrar ocorrência - ${alunoNome}` : "Registrar ocorrência");
    }

    if (descricao) {
        descricao.value = ocorrencia?.descricao || "";
    }

    if (selectTipo) {
        selectTipo.value = ocorrencia?.tipo || "Pedagógica";
    }

    const botaoSalvar = document.getElementById("salvarOcorrencia");
    if (botaoSalvar) {
        botaoSalvar.onclick = () => salvarOcorrencia();
    }

    const form = document.getElementById("formOcorrencia");
    if (form) {
        form.onsubmit = (event) => {
            event.preventDefault();
            salvarOcorrencia();
        };
    }
}

function abrirModalOcorrenciaTurma(codigoTurma, ocorrenciaId = "") {
    const modal = document.getElementById("modalOcorrenciaTurma");
    const form = document.getElementById("formOcorrenciaTurma");
    const titulo = document.getElementById("modalTituloOcorrenciaTurma");
    const campoCodigo = document.getElementById("codigoTurmaOcorrenciaTurma");
    const campoId = document.getElementById("ocorrenciaTurmaIdEdicao");
    const campoData = document.getElementById("dataOcorrenciaTurma");
    const campoTipo = document.getElementById("tipoOcorrenciaTurma");
    const campoDescricao = document.getElementById("descricaoOcorrenciaTurma");
    const botaoCancelar = document.getElementById("btnCancelarOcorrenciaTurma");

    if (!modal || !form || !titulo || !campoCodigo || !campoId || !campoData || !campoTipo || !campoDescricao || !botaoCancelar) {
        return;
    }

    const ocorrencias = carregarOcorrenciasGeraisDaTurma(codigoTurma);
    const ocorrencia = ocorrencias.find((item) => item.id === ocorrenciaId) || null;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    campoCodigo.value = codigoTurma;
    campoId.value = ocorrencia?.id || "";
    campoData.value = ocorrencia?.data || "";
    campoTipo.value = ocorrencia?.tipo || "";
    campoDescricao.value = ocorrencia?.descricao || "";
    titulo.textContent = ocorrencia ? "Editar ocorrência da turma" : "Cadastrar ocorrência da turma";

    botaoCancelar.onclick = fecharModalOcorrenciaTurma;
    modal.onclick = (event) => {
        if (event.target === modal) {
            fecharModalOcorrenciaTurma();
        }
    };

    form.onsubmit = (event) => salvarOcorrenciaTurma(event);
}

function fecharModalOcorrenciaTurma() {
    const modal = document.getElementById("modalOcorrenciaTurma");
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function salvarOcorrenciaTurma(event) {
    event.preventDefault();

    const codigoTurma = document.getElementById("codigoTurmaOcorrenciaTurma")?.value?.trim();
    const ocorrenciaId = document.getElementById("ocorrenciaTurmaIdEdicao")?.value?.trim();
    const data = document.getElementById("dataOcorrenciaTurma")?.value || "";
    const tipo = document.getElementById("tipoOcorrenciaTurma")?.value?.trim() || "";
    const descricao = document.getElementById("descricaoOcorrenciaTurma")?.value?.trim() || "";

    if (!codigoTurma || !data || !tipo || !descricao) {
        alert("Informe data, tipo e descrição da ocorrência da turma.");
        return;
    }

    const ocorrencias = carregarOcorrenciasGeraisDaTurma(codigoTurma);
    const payload = {
        id: ocorrenciaId || `${Date.now()}`,
        data,
        tipo,
        descricao
    };

    if (ocorrenciaId) {
        const indice = ocorrencias.findIndex((item) => item.id === ocorrenciaId);
        if (indice >= 0) {
            ocorrencias[indice] = payload;
        }
    } else {
        ocorrencias.push(payload);
    }

    salvarOcorrenciasGeraisDaTurma(codigoTurma, ocorrencias);
    limparRascunhoFormulario("formOcorrenciaTurma");
    fecharModalOcorrenciaTurma();
    renderizarOcorrenciasGeraisTurmaNaPagina(codigoTurma);
    mostrarAbaOcorrenciasTurma(codigoTurma, "turma");
    return true;
}

function excluirOcorrenciaTurma(codigoTurma, ocorrenciaId) {
    if (!codigoTurma || !ocorrenciaId) {
        return;
    }

    const confirmou = window.confirm("Deseja realmente excluir esta ocorrência da turma?");
    if (!confirmou) {
        return;
    }

    const ocorrencias = carregarOcorrenciasGeraisDaTurma(codigoTurma).filter((item) => item.id !== ocorrenciaId);
    salvarOcorrenciasGeraisDaTurma(codigoTurma, ocorrencias);
    renderizarOcorrenciasGeraisTurmaNaPagina(codigoTurma);
    mostrarAbaOcorrenciasTurma(codigoTurma, "turma");
}

function obterChaveOcorrenciasProjetoTurma(codigoTurma) {
    return `${STORAGE_KEY_OCORRENCIAS_PROJETOS_TURMA}_${codigoTurma}`;
}

function carregarOcorrenciasProjetoDaTurma(codigoTurma) {
    const ocorrencias = carregarTurmasDoStorage(obterChaveOcorrenciasProjetoTurma(codigoTurma));
    if (!Array.isArray(ocorrencias)) {
        return [];
    }

    return ocorrencias.map((item, index) => ({
        id: item?.id || `${codigoTurma}-projeto-${index + 1}`,
        data: item?.data || "",
        tipo: item?.tipo || "Pedagógica",
        descricao: item?.descricao || ""
    }));
}

function salvarOcorrenciasProjetoDaTurma(codigoTurma, ocorrencias) {
    salvarTurmasNoStorage(ocorrencias, obterChaveOcorrenciasProjetoTurma(codigoTurma));
}

function renderizarOcorrenciasProjetoNaPagina(codigoTurma) {
    const container = document.getElementById("listaOcorrenciasProjeto");
    if (!container) {
        return;
    }

    const ocorrencias = carregarOcorrenciasProjetoDaTurma(codigoTurma)
        .slice()
        .sort((a, b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime());

    container.innerHTML = `
        <div class="saep-card">
            <div class="saep-card__header">
                <h3>Ocorrências do projeto</h3>
            </div>
            <div class="table-scroll">
                <table class="o-container__turmas__cadastrar__tabela seeduc-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo de ocorrência</th>
                            <th>Ocorrência</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ocorrencias.length === 0 ? '<tr><td colspan="4">Nenhuma ocorrência registrada para esta turma.</td></tr>' : ocorrencias.map((item) => `
                            <tr>
                                <td>${item.data ? formatarDataParaExibir(item.data) : "-"}</td>
                                <td>${item.tipo || "-"}</td>
                                <td>${item.descricao || "-"}</td>
                                <td>
                                    <button type="button" class="btn-edit" title="Editar ocorrência" onclick="abrirModalOcorrenciaProjeto('${codigoTurma}', '${item.id}')">✏️</button>
                                    <button type="button" class="btn-delete" title="Excluir ocorrência" onclick="excluirOcorrenciaProjeto('${codigoTurma}', '${item.id}')">🗑️</button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderizarDetalhesTurmaProjetoNaPagina() {
    const codigoTurmaParam = new URLSearchParams(window.location.search).get("turma");
    const codigoTurmaSalvo = obterValorPersistente(ULTIMA_TURMA_OCORRENCIA_PROJETO_SESSION_STORAGE);
    const codigoTurma = (codigoTurmaParam || codigoTurmaSalvo || "").trim();
    const titulo = document.getElementById("tituloTurmaProjetoOcorrencia");
    const dadosTurma = document.getElementById("dadosTurmaProjetoOcorrencia");
    const containerOcorrencias = document.getElementById("listaOcorrenciasProjeto");
    const botaoCadastrarOcorrencia = document.getElementById("btnCadastrarOcorrenciaProjeto");
    const campoCodigo = document.getElementById("codigoTurmaOcorrenciaProjeto");

    if (!titulo || !dadosTurma || !containerOcorrencias || !botaoCadastrarOcorrencia || !campoCodigo) {
        return;
    }

    if (!codigoTurma) {
        titulo.textContent = "Turma não selecionada";
        dadosTurma.textContent = "Volte para a lista de turmas com projeto e selecione uma turma.";
        containerOcorrencias.innerHTML = "";
        return;
    }

    salvarValorPersistente(ULTIMA_TURMA_OCORRENCIA_PROJETO_SESSION_STORAGE, codigoTurma);

    const turma = obterTurmaProjetoPorCodigo(codigoTurma);
    if (!turma) {
        titulo.textContent = "Turma não encontrada";
        dadosTurma.textContent = "A turma selecionada não está mais disponível.";
        containerOcorrencias.innerHTML = "";
        return;
    }

    titulo.textContent = turma.codigoTurma;
    dadosTurma.textContent = `${turma.curso} | Projeto: ${turma.projeto} | ${turma.instrutor} | ${formatarDataParaExibir(turma.dataInicio)} a ${formatarDataParaExibir(turma.dataFim)}`;
    campoCodigo.value = codigoTurma;
    botaoCadastrarOcorrencia.onclick = () => abrirModalOcorrenciaProjeto(codigoTurma);

    renderizarOcorrenciasProjetoNaPagina(codigoTurma);
}

function abrirModalOcorrenciaProjeto(codigoTurma, ocorrenciaId = "") {
    const modal = document.getElementById("modalOcorrenciaProjeto");
    const form = document.getElementById("formOcorrenciaProjeto");
    const titulo = document.getElementById("modalTituloOcorrenciaProjeto");
    const campoCodigo = document.getElementById("codigoTurmaOcorrenciaProjeto");
    const campoId = document.getElementById("ocorrenciaProjetoIdEdicao");
    const campoData = document.getElementById("dataOcorrenciaProjeto");
    const campoTipo = document.getElementById("tipoOcorrenciaProjeto");
    const campoDescricao = document.getElementById("descricaoOcorrenciaProjeto");
    const botaoCancelar = document.getElementById("btnCancelarOcorrenciaProjeto");

    if (!modal || !form || !titulo || !campoCodigo || !campoId || !campoData || !campoTipo || !campoDescricao || !botaoCancelar) {
        return;
    }

    const ocorrencias = carregarOcorrenciasProjetoDaTurma(codigoTurma);
    const ocorrencia = ocorrencias.find((item) => item.id === ocorrenciaId) || null;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    campoCodigo.value = codigoTurma;
    campoId.value = ocorrencia?.id || "";
    campoData.value = ocorrencia?.data || "";
    campoTipo.value = ocorrencia?.tipo || "";
    campoDescricao.value = ocorrencia?.descricao || "";
    titulo.textContent = ocorrencia ? "Editar ocorrência do projeto" : "Cadastrar ocorrência do projeto";

    botaoCancelar.onclick = fecharModalOcorrenciaProjeto;
    modal.onclick = (event) => {
        if (event.target === modal) {
            fecharModalOcorrenciaProjeto();
        }
    };

    form.onsubmit = (event) => salvarOcorrenciaProjeto(event);
}

function fecharModalOcorrenciaProjeto() {
    const modal = document.getElementById("modalOcorrenciaProjeto");
    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

function salvarOcorrenciaProjeto(event) {
    event.preventDefault();

    const codigoTurma = document.getElementById("codigoTurmaOcorrenciaProjeto")?.value?.trim();
    const ocorrenciaId = document.getElementById("ocorrenciaProjetoIdEdicao")?.value?.trim();
    const data = document.getElementById("dataOcorrenciaProjeto")?.value || "";
    const tipo = document.getElementById("tipoOcorrenciaProjeto")?.value?.trim() || "";
    const descricao = document.getElementById("descricaoOcorrenciaProjeto")?.value?.trim() || "";

    if (!codigoTurma || !data || !tipo || !descricao) {
        alert("Informe data, tipo e descrição da ocorrência do projeto.");
        return;
    }

    const ocorrencias = carregarOcorrenciasProjetoDaTurma(codigoTurma);
    const payload = {
        id: ocorrenciaId || `${Date.now()}`,
        data,
        tipo,
        descricao
    };

    if (ocorrenciaId) {
        const indice = ocorrencias.findIndex((item) => item.id === ocorrenciaId);
        if (indice >= 0) {
            ocorrencias[indice] = payload;
        }
    } else {
        ocorrencias.push(payload);
    }

    salvarOcorrenciasProjetoDaTurma(codigoTurma, ocorrencias);
    limparRascunhoFormulario("formOcorrenciaProjeto");
    fecharModalOcorrenciaProjeto();
    renderizarOcorrenciasProjetoNaPagina(codigoTurma);
    return true;
}

function excluirOcorrenciaProjeto(codigoTurma, ocorrenciaId) {
    if (!codigoTurma || !ocorrenciaId) {
        return;
    }

    const confirmou = window.confirm("Deseja realmente excluir esta ocorrência do projeto?");
    if (!confirmou) {
        return;
    }

    const ocorrencias = carregarOcorrenciasProjetoDaTurma(codigoTurma).filter((item) => item.id !== ocorrenciaId);
    salvarOcorrenciasProjetoDaTurma(codigoTurma, ocorrencias);
    renderizarOcorrenciasProjetoNaPagina(codigoTurma);
}

function obterApiKeyGeminiOcorrencia() {
    const chaveSessao = (sessionStorage.getItem(GEMINI_KEY_SESSION_STORAGE) || "").trim();
    if (chaveSessao) {
        return chaveSessao;
    }

    const chaveLocal = (localStorage.getItem(GEMINI_KEY_LOCAL_STORAGE) || "").trim();
    if (chaveLocal) {
        return chaveLocal;
    }

    const chaveConfig = (APP_SYNC_CONFIG.geminiApiKey || "").trim();
    return chaveConfig;
}

function gerarSugestaoTextoLocalOcorrencia(textoDescricao) {
    const textoLimpo = String(textoDescricao || "").replace(/\s+/g, " ").trim();
    if (!textoLimpo) {
        return "";
    }

    const primeiraMaiuscula = textoLimpo.charAt(0).toUpperCase() + textoLimpo.slice(1);
    const textoFinal = /[.!?]$/.test(primeiraMaiuscula) ? primeiraMaiuscula : `${primeiraMaiuscula}.`;

    return `Durante o período letivo, foi registrada a seguinte ocorrência: ${textoFinal} O caso foi devidamente formalizado para acompanhamento pedagógico.`;
}

async function gerarSugestaoTextoComGemini(textoDescricao, apiKeySobrescrita = "") {
    const apiKey = (apiKeySobrescrita || obterApiKeyGeminiOcorrencia()).trim();
    if (!apiKey) {
        throw new Error("API Key do Gemini não configurada. Defina APP_SYNC_CONFIG.geminiApiKey em sync-config.js.");
    }

    const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            system_instruction: {
                parts: [{
                    text: "Você é um agente de IA especialista em ajuste de texto para registros escolares. Sua única tarefa é reescrever o texto informal de ocorrência fornecido pelo usuário em uma versão formal, corporativa, impessoal e adequada ao contexto escolar. Preserve o sentido original, melhore a gramática e a clareza, e entregue apenas o texto final pronto para uso em registro pedagógico. Não crie planos de ação, não dê conselhos e não adicione informações que não estavam no texto original."
                }]
            },
            contents: [{
                role: "user",
                parts: [{ text: textoDescricao }]
            }],
            generationConfig: {
                temperature: 0.3,
                topP: 0.9,
                maxOutputTokens: 700
            }
        })
    });

    if (!resposta.ok) {
        let detalheErro = "";
        try {
            const corpoErro = await resposta.json();
            detalheErro = corpoErro?.error?.message || "";
        } catch (error) {
            detalheErro = "";
        }

        throw new Error(`Falha ao consultar Gemini (${resposta.status})${detalheErro ? `: ${detalheErro}` : "."}`);
    }

    const dados = await resposta.json();
    return dados?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

function fecharModalOcorrencia() {
    const modal = document.getElementById("modalOcorrencia");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }

    const codigo = document.getElementById("codigoTurmaOcorrencia");
    const aluno = document.getElementById("alunoOcorrencia");
    const nome = document.getElementById("nomeAlunoOcorrencia");
    const descricao = document.getElementById("descricaoOcorrencia");
    const ocorrenciaId = document.getElementById("ocorrenciaIdEdicao");

    if (codigo) {
        codigo.value = "";
    }
    if (aluno) {
        aluno.value = "";
    }
    if (nome) {
        nome.value = "";
    }
    if (descricao) {
        descricao.value = "";
    }
    if (ocorrenciaId) {
        ocorrenciaId.value = "";
    }
}

async function gerarSugestaoTexto() {
    const descricao = document.getElementById("descricaoOcorrencia").value.trim();
    const assistido = document.getElementById("textoAssistido");

    if (!assistido) {
        return;
    }

    if (!descricao) {
        assistido.value = "Descreva primeiro o contexto da ocorrência para gerar uma sugestão útil.";
        return;
    }

    const apiKey = obterApiKeyGeminiOcorrencia();
    const sugestaoLocal = gerarSugestaoTextoLocalOcorrencia(descricao);

    if (!apiKey) {
        assistido.value = sugestaoLocal;
        return;
    }

    assistido.value = "Gerando sugestão com IA...";

    try {
        const respostaIa = await gerarSugestaoTextoComGemini(descricao, apiKey);
        if (respostaIa) {
            assistido.value = respostaIa;
            return;
        }
    } catch (error) {
        console.warn("Falha ao gerar sugestão com Gemini:", error);

        const mensagemErro = String(error?.message || "").toLowerCase();
        if (mensagemErro.includes("api key") || mensagemErro.includes("401") || mensagemErro.includes("403")) {
            sessionStorage.removeItem(GEMINI_KEY_SESSION_STORAGE);
            localStorage.removeItem(GEMINI_KEY_LOCAL_STORAGE);
            assistido.value = sugestaoLocal;
            return;
        }
    }

    assistido.value = sugestaoLocal;
}

function salvarOcorrencia() {
    const codigoTurma = document.getElementById("codigoTurmaOcorrencia").value.trim();
    const nomeAluno = document.getElementById("nomeAlunoOcorrencia").value.trim() || document.getElementById("alunoOcorrencia").value.trim();
    const tipo = document.getElementById("tipoOcorrencia").value;
    const descricao = document.getElementById("descricaoOcorrencia").value.trim();
    const ocorrenciaId = document.getElementById("ocorrenciaIdEdicao").value.trim();

    if (!codigoTurma || !nomeAluno || !descricao) {
        alert("Informe o aluno e a descrição da ocorrência.");
        return;
    }

    const ocorrencias = carregarOcorrenciasDaTurma(codigoTurma);
    const textoFinal = `Ocorrência ${tipo} registrada para ${nomeAluno}. ${descricao}`;

    if (ocorrenciaId) {
        const indice = ocorrencias.findIndex((item) => item.id === ocorrenciaId);
        if (indice >= 0) {
            ocorrencias[indice] = {
                ...ocorrencias[indice],
                aluno: nomeAluno,
                tipo,
                descricao: textoFinal,
                textoAssistido: ""
            };
        }
    } else {
        ocorrencias.push({ id: `${Date.now()}`, aluno: nomeAluno, tipo, descricao: textoFinal, textoAssistido: "" });
    }

    salvarOcorrenciasDaTurma(codigoTurma, ocorrencias);
    limparRascunhoFormulario("formOcorrencia");
    fecharModalOcorrencia();
    renderizarDetalhesTurmaNaPagina();
    return true;
}

window.addEventListener("DOMContentLoaded", async () => {
    configurarReforcoPersistenciaGlobal();

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

    const modalDiagnostica = document.getElementById("modalCadastroDiagnostica");
    if (modalDiagnostica) {
        modalDiagnostica.addEventListener("click", (event) => {
            if (event.target === modalDiagnostica) {
                fecharModalDiagnostica();
            }
        });
    }

});