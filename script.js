'use strict';

// ============================================
// UTILS
// ============================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatDate = (dateString) => { 
    if(!dateString) return ''; 
    const parts = dateString.split('-'); 
    if(parts.length===3) return `${parts[2]}/${parts[1]}/${parts[0]}`; 
    return dateString; 
};
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
}).format(val || 0);

const getTodayISO = () => new Date().toISOString().split('T')[0];
const getYearFromDate = (dateString) => {
    const d = new Date(dateString);
    return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
};
const getMonthFromDate = (dateString) => {
    const d = new Date(dateString);
    return Number.isNaN(d.getTime()) ? 0 : d.getMonth();
};

const FINANCIAL_CATEGORY_LABELS = {
    consulta: 'Consulta',
    procedimento: 'Procedimento',
    retorno: 'Retorno',
    convenio: 'Convênio',
    venda: 'Venda',
    estoque: 'Estoque',
    despesa_estoque: 'Estoque',
    salario: 'Salário',
    aluguel: 'Aluguel',
    energia: 'Energia',
    internet: 'Internet',
    impostos: 'Impostos',
    marketing: 'Marketing',
    software: 'Sistema/Software',
    manutencao: 'Manutenção',
    outros: 'Outros',
    receita: 'Receita',
    despesa: 'Despesa'
};

const FINANCIAL_STATUS_LABELS = {
    pago: 'Pago',
    pendente: 'Pendente',
    vencido: 'Vencido'
};

const getFinancialEntryType = (entry) => Number(entry?.valor || 0) >= 0 ? 'receita' : 'despesa';
const getFinancialCategoryLabel = (value) => FINANCIAL_CATEGORY_LABELS[value] || value || 'Outros';
const getFinancialStatusLabel = (value) => FINANCIAL_STATUS_LABELS[value] || 'Pago';
const getFinancialStatusBadgeClass = (value) => ({ pago: 'badge-secondary', pendente: 'badge-warning', vencido: 'badge-danger' }[value] || 'badge-secondary');
const getFinancialTypeLabel = (value) => value === 'despesa' ? 'Despesa' : 'Receita';

function normalizeFinancialEntry(entry = {}) {
    const valorAbsoluto = Math.abs(Number(entry.valor || 0));
    const inferredType = entry.tipoLancamento || getFinancialEntryType(entry);
    const signedValue = inferredType === 'despesa' ? -valorAbsoluto : valorAbsoluto;
    const categoriaRaw = entry.categoria || (inferredType === 'despesa' ? 'outros' : 'consulta');
    const status = entry.status || (Number(signedValue) < 0 ? 'pago' : 'pago');
    return {
        ...entry,
        valor: signedValue,
        tipoLancamento: inferredType,
        tipo: entry.tipo || entry.descricao || (inferredType === 'despesa' ? 'Despesa' : 'Receita'),
        descricao: entry.descricao || entry.tipo || entry.pacienteNome || entry.origem || 'Lançamento financeiro',
        origem: entry.origem || (entry.estoqueItemId ? 'Estoque' : 'Manual'),
        categoria: categoriaRaw,
        status,
        metodo: entry.metodo || '—',
        observacao: entry.observacao || '',
        manual: entry.manual !== undefined ? !!entry.manual : !entry.estoqueItemId,
        pacienteNome: entry.pacienteNome || ''
    };
}

function buildFinancialEntries() {
    const persisted = (DB.financeiro || []).map(normalizeFinancialEntry);

    const existingStockIds = new Set(
        persisted
            .filter(f => (f.categoria === 'despesa_estoque' || f.categoria === 'estoque') && f.estoqueItemId)
            .map(f => f.estoqueItemId)
    );

    const legacyStockExpenses = (DB.estoque || [])
        .filter(item => item && !existingStockIds.has(item.id))
        .map(item => normalizeFinancialEntry({
            id: `stock_${item.id}`,
            data: item.dataEntrada || item.dataCompra || getTodayISO(),
            pacienteId: null,
            pacienteNome: '',
            tipo: 'Compra de estoque',
            descricao: `Compra de estoque • ${item.nome}`,
            valor: -Math.abs((Number(item.qtd) || 0) * (Number(item.custo) || 0)),
            metodo: 'Custo interno',
            parcelas: 1,
            origem: 'Estoque',
            categoria: 'despesa_estoque',
            status: 'pago',
            estoqueItemId: item.id,
            manual: false,
            detalhes: { item: item.nome, lote: item.lote || 'N/A' }
        }))
        .filter(item => item.valor !== 0);

    return [...persisted, ...legacyStockExpenses]
        .sort((a, b) => new Date(b.data) - new Date(a.data));
}


// ============================================
// STATE
// ============================================
let currentUserRole = null;
let calendarDate = new Date();
let currentConsultationId = null;
let currentQuickPatientId = null;
let tempPrescription = [];
let tempExams = [];
let tempAnamnese = null;
let financeChart = null;
let patientsChart = null;
let financialFilterMode = 'month';
let financialFilterYear = new Date().getFullYear();
let financialFilterMonth = new Date().getMonth();
let financialFilterType = 'all';
let financialFilterCategory = 'all';
let financialFilterStatus = 'all';

let DB = {
    pacientes: [],
    agendamentos: [],
    cupons: [],
    estoque: [],
    auditoria: [],
    atendimentos: [],
    catalogoExames: [],
    financeiro: [],
    protocolos: [],
    contratos: [],
    avaliacoes: [],
    servicos: []
};

// ============================================
// INITIAL DATA
// ============================================
const initialData = {
    pacientes: [
        { id: '1', nome: 'João Silva', cpf: '123.456.789-00', tel: '(11) 98765-4321', lgpdConsent: true, dataCadastro: '2021-05-10', dataNascimento: '1985-05-20', endereco: 'Rua A', tipoAtendimento: 'Particular' },
        { id: '2', nome: 'Maria Oliveira', cpf: '234.567.890-11', tel: '(21) 99876-5432', lgpdConsent: true, dataCadastro: '2021-08-20', dataNascimento: '1990-08-15', endereco: 'Av B', tipoAtendimento: 'Convênio' },
        { id: '3', nome: 'Carlos Pereira', cpf: '345.678.901-22', tel: '(11) 91234-5678', lgpdConsent: true, dataCadastro: '2022-02-11', dataNascimento: '1978-03-10', endereco: 'Rua C', tipoAtendimento: 'Particular' },
        { id: '4', nome: 'Ana Santos', cpf: '456.789.012-33', tel: '(21) 93456-7890', lgpdConsent: true, dataCadastro: '2022-05-03', dataNascimento: '1988-11-02', endereco: 'Av D', tipoAtendimento: 'Convênio' },
        { id: '5', nome: 'Marcos Lima', cpf: '567.890.123-44', tel: '(31) 95555-4444', lgpdConsent: true, dataCadastro: '2023-01-20', dataNascimento: '1992-07-15', endereco: 'Rua E', tipoAtendimento: 'Particular' },
        { id: '6', nome: 'Patrícia Costa', cpf: '678.901.234-55', tel: '(41) 96666-3333', lgpdConsent: true, dataCadastro: '2023-03-12', dataNascimento: '1995-12-05', endereco: 'Av F', tipoAtendimento: 'Particular' },
        { id: '7', nome: 'Rafael Gomes', cpf: '789.012.345-66', tel: '(51) 97777-2222', lgpdConsent: true, dataCadastro: '2023-06-30', dataNascimento: '1982-09-09', endereco: 'Rua G', tipoAtendimento: 'Convênio' },
        { id: '8', nome: 'Sofia Almeida', cpf: '890.123.456-77', tel: '(61) 98888-1111', lgpdConsent: true, dataCadastro: '2024-01-05', dataNascimento: '2000-04-22', endereco: 'Av H', tipoAtendimento: 'Particular' },
        { id: '9', nome: 'Felipe Rocha', cpf: '901.234.567-88', tel: '(71) 99999-0000', lgpdConsent: true, dataCadastro: '2024-07-19', dataNascimento: '1975-06-30', endereco: 'Rua I', tipoAtendimento: 'Particular' },
        { id: '10', nome: 'Bruna Ferreira', cpf: '012.345.678-99', tel: '(81) 98877-6655', lgpdConsent: true, dataCadastro: '2024-10-11', dataNascimento: '1998-02-18', endereco: 'Av J', tipoAtendimento: 'Convênio' }
    ],
    protocolos: [
        { id: 'p1', nome: 'Emagrecimento 60 Dias', valor: 2500.00, duracao: 60, servicos: { 'Consulta': 2, 'Nutricionista': 2, 'Exame': 1, 'Procedimento': 4 } },
        { id: 'p2', nome: 'Fisioterapia Intensiva', valor: 1200.00, duracao: 30, servicos: { 'Procedimento': 10, 'Consulta': 1 } },
        { id: 'p3', nome: 'Reabilitação Pós-Cirúrgica', valor: 1800.00, duracao: 45, servicos: { 'Consulta': 3, 'Procedimento': 8 } },
        { id: 'p4', nome: 'Antiaging - 12 Semanas', valor: 3200.00, duracao: 84, servicos: { 'Consulta': 4, 'Procedimento': 10, 'Exame': 2 } },
        { id: 'p5', nome: 'Checkup Preventivo', valor: 450.00, duracao: 1, servicos: { 'Consulta': 1, 'Exame': 3 } },
        { id: 'p6', nome: 'Controle de Dor Crônica', valor: 900.00, duracao: 30, servicos: { 'Consulta': 2, 'Procedimento': 6 } },
        { id: 'p7', nome: 'Estética Facial Básica', valor: 650.00, duracao: 21, servicos: { 'Consulta': 1, 'Procedimento': 3 } }
    ],
    servicos: [
        { id: 's1',  nome: 'Fisioterapia Traumato-ortopédica', icone: 'fa-bone' },
        { id: 's2',  nome: 'Fisioterapia Esportiva',           icone: 'fa-dumbbell' },
        { id: 's3',  nome: 'Fisioterapia Neurológica',         icone: 'fa-brain' },
        { id: 's4',  nome: 'Fisioterapia Neurológica Infantil',icone: 'fa-baby' },
        { id: 's5',  nome: 'Fisioterapia para Amputados',      icone: 'fa-wheelchair' },
        { id: 's6',  nome: 'Reabilitação Física (público idoso)', icone: 'fa-user-group' },
        { id: 's7',  nome: 'Fisioterapia Cardiopulmonar',      icone: 'fa-heart-pulse' },
        { id: 's8',  nome: 'Fisioterapia Respiratória',        icone: 'fa-lungs' },
        { id: 's9',  nome: 'Osteopatia',                       icone: 'fa-stethoscope' },
        { id: 's10', nome: 'Fonoaudiologia',                   icone: 'fa-microphone' },
        { id: 's11', nome: 'Nutrição',                         icone: 'fa-apple-whole' },
        { id: 's12', nome: 'Pilates Clínico',                  icone: 'fa-person-walking' },
        { id: 's13', nome: 'Recovery Esportivo',               icone: 'fa-bolt' },
        { id: 's14', nome: 'Liberação Miofascial',             icone: 'fa-hand-dots' }
    ],
    estoque: [
        { id: 'e1', nome: 'Dipirona 500mg', lote: 'L100', validade: '2025-12-01', qtd: 50, min: 20, preco: 2.50, custo: 0.50 },
        { id: 'e4', nome: 'Seringa 5ml', lote: 'S500', validade: '2026-01-01', qtd: 100, min: 50, preco: 5.00, custo: 1.00 }
    ],
    catalogoExames: [
        { id: 'ex1', nome: 'Hemograma Completo', preco: 35.00 },
        { id: 'ex4', nome: 'Raio-X de Tórax', preco: 90.00 }
    ],
    financeiro: [
        { id: 'f23_5', data: '2023-12-20', pacienteId: '1', pacienteNome: 'João Silva', tipo: 'Consulta', valor: 250.00, metodo: 'Cartão', parcelas: 1, detalhes: { medicamentos: 0 } },
        { id: 'f_sim_1', data: '2026-01-15', pacienteId: '3', pacienteNome: 'Carlos Pereira', tipo: 'Consulta', valor: 150.00, metodo: 'Pix', parcelas: 1 }
    ],
    atendimentos: [
        { id: 'at1', agendamentoId: 'old1', pacienteId: '1', data: '2023-12-20', prescricao: [], exames: [], anamnese: { "5": "Dor de cabeça persistente." } },
        { id: 'at_sim_1', agendamentoId: 'ag_sim_old', pacienteId: '4', data: '2025-11-02', prescricao: [], exames: [], anamnese: { note: 'Histórico: recuperação parcial.' } }
    ],
    agendamentos: [
        { id: 'ag_past_1', pacienteId: '1', pacienteNome: 'João Silva', data: '2025-12-20', hora: '10:00', motivo: 'Retorno', tipo: 'Retorno', valor: 150.00, prioridade: 'Normal', status: 'Finalizado' }
    ],
    auditoria: []
};

// Perguntas padrão para Anamnese
const STANDARD_QUESTIONS = [
    'Queixa principal (motivo da consulta)',
    'Início dos sintomas (data/tempo)',
    'Localização da dor / sintoma',
    'Intensidade (0-10)',
    'Fatores que agravam',
    'Fatores que aliviam',
    'Sintomas associados',
    'Histórico médico pregresso',
    'Uso de medicação atual',
    'Alergias conhecidas',
    'Cirurgias prévias relevantes',
    'Doenças crônicas (hipertensão, diabetes etc.)',
    'Tabagismo / etilismo',
    'Atividade física / rotina',
    'Sono / padrão alimentar',
    'Eventos familiares relevantes',
    'Tratamentos anteriores para o problema',
    'Expectativas do paciente',
    'Observações sobre mobilidade / função',
    'Outras observações clínicas'
];

// Flag de simulação
const SIMULATE_TESTS = false;

// ============================================
// SERVER DB (MariaDB via PHP API)
// ============================================
const API_STATE_URL = 'api/state.php';
const API_COLLECTION_URLS = {
    pacientes: 'api/patients.php',
    agendamentos: 'api/appointments.php',
    financeiro: 'api/financial.php',
    estoque: 'api/stock.php',
    protocolos: 'api/protocols.php',
    cupons: 'api/cupons.php',
    auditoria:      'api/auditoria.php',
    atendimentos:   'api/atendimentos.php',
    avaliacoes:     'api/avaliacoes.php',
    catalogoExames: 'api/exames.php'
};
let USING_SERVER_DB = false;
let USING_RESOURCE_APIS = false;

async function apiGetState() {
    try {
        const res = await fetch(API_STATE_URL, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function apiSaveState(payload) {
    try {
        const res = await fetch(API_STATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}


async function apiGetCollection(key) {
    const url = API_COLLECTION_URLS[key];
    if (!url) return null;
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data?.items) ? data.items : null;
    } catch (e) {
        return null;
    }
}

async function apiUpsertResource(key, payload) {
    const url = API_COLLECTION_URLS[key];
    if (!url) return false;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function apiDeleteResource(key, id) {
    const url = API_COLLECTION_URLS[key];
    if (!url || !id) return false;
    try {
        const res = await fetch(`${url}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function apiLoadResources() {
    const keys = Object.keys(API_COLLECTION_URLS);
    try {
        const values = await Promise.all(keys.map(key => apiGetCollection(key)));
        const mapped = Object.fromEntries(keys.map((key, idx) => [key, values[idx]]));
        const hasAny = keys.some(key => Array.isArray(mapped[key]));
        if (!hasAny) return null;
        return mapped;
    } catch (e) {
        return null;
    }
}


// ============================================
// CORE FUNCTIONS
// ============================================

function checkAlerts() {
    const alertsList = document.getElementById('alerts-list');
    const badge = document.getElementById('alert-badge');
    const alertBox = document.getElementById('dashboard-alerts');
    let count = 0; 
    let html = '';
    
    if (!DB.estoque) return;
    
    DB.estoque.forEach(e => {
        const today = new Date(); 
        const valDate = new Date(e.validade);
        if (valDate < today) { 
            count++; 
            html += `<div class="flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation text-[#6F4B36]"></i><span>Item <b>${e.nome}</b> (Lote ${e.lote}) está <span class="font-bold text-[#6F4B36]">VENCIDO</span>.</span></div>`; 
        } else if (e.qtd <= e.min) { 
            count++; 
            html += `<div class="flex items-center gap-2"><i class="fa-solid fa-circle-exclamation text-[#6F4B36]"></i><span>Item <b>${e.nome}</b> está com estoque <span class="font-bold text-[#6F4B36]">BAIXO</span> (${e.qtd} unidades).</span></div>`; 
        }
    });
    
    if (count > 0 && badge && alertBox && alertsList) {
        badge.innerText = count; 
        badge.classList.remove('hidden'); 
        alertsList.innerHTML = html; 
        alertBox.classList.remove('hidden');
    } else if (badge && alertBox) {
        badge.classList.add('hidden'); 
        alertBox.classList.add('hidden');
    }
}

async function loadDB() {
    const resourceData = await apiLoadResources();
    if (resourceData) {
        DB = {
            ...initialData,
            ...DB,
            pacientes: resourceData.pacientes || initialData.pacientes,
            agendamentos: resourceData.agendamentos || [],
            financeiro: resourceData.financeiro || [],
            estoque: resourceData.estoque || [],
            protocolos: resourceData.protocolos || initialData.protocolos,
            cupons: resourceData.cupons || [],
            auditoria: (resourceData.auditoria || []).map(function(a) {
                return {
                    id:        String(a.id),
                    timestamp: a.created_at || a.timestamp || '',
                    usuario:   a.usuario   || 'Sistema',
                    acao:      a.acao      || '',
                    entidade:  a.entidade  || '',
                    detalhes:  a.detalhes  || ''
                };
            })
        };
        DB.atendimentos = (resourceData.atendimentos || []).map(function(a) {
            return {
                id:            a.id,
                agendamentoId: a.agendamento_id || a.agendamentoId || '',
                pacienteId:    a.paciente_id    || a.pacienteId    || '',
                data:          a.data           || '',
                prescricao:    a.prescricao     || [],
                exames:        a.exames         || [],
                anamnese:      a.anamnese       || {}
            };
        });
        DB.avaliacoes = (resourceData.avaliacoes || []).map(function(a) {
            return {
                id:         a.id,
                pacienteId: a.paciente_id || a.pacienteId || '',
                timestamp:  a.timestamp  || a.created_at || '',
                perguntas:  a.perguntas  || [],
                notes:      a.notes      || ''
            };
        });
        DB.catalogoExames = (resourceData.catalogoExames && resourceData.catalogoExames.length)
            ? resourceData.catalogoExames.map(function(e) {
                return { id: e.id, nome: e.nome, preco: parseFloat(e.preco) || 0 };
              })
            : initialData.catalogoExames;
        if (!DB.contratos) DB.contratos = initialData.contratos;
        USING_RESOURCE_APIS = true;
        USING_SERVER_DB = false;
        localStorage.setItem('sgc_db', JSON.stringify(DB));
        checkAlerts();
        return;
    }

    const serverData = await apiGetState();
    if (serverData && typeof serverData === 'object') {
        DB = { ...initialData, ...serverData };
        if (!DB.protocolos) DB.protocolos = initialData.protocolos;
        if (!DB.avaliacoes) DB.avaliacoes = [];
        USING_SERVER_DB = true;
        USING_RESOURCE_APIS = false;
        localStorage.setItem('sgc_db', JSON.stringify(DB));
        checkAlerts();
        return;
    }

    USING_SERVER_DB = false;
    USING_RESOURCE_APIS = false;
    const saved = localStorage.getItem('sgc_db');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            DB = { ...initialData, ...parsed };
            if (!DB.protocolos) DB.protocolos = initialData.protocolos;
        } catch(e) {
            DB = JSON.parse(JSON.stringify(initialData));
            localStorage.setItem('sgc_db', JSON.stringify(DB));
        }
    } else {
        DB = JSON.parse(JSON.stringify(initialData));
        localStorage.setItem('sgc_db', JSON.stringify(DB));
    }

    if(!DB.avaliacoes) DB.avaliacoes = [];
    checkAlerts();
}

function saveDB() {
    localStorage.setItem('sgc_db', JSON.stringify(DB));
    checkAlerts();

    if (USING_SERVER_DB && !USING_RESOURCE_APIS) {
        apiSaveState(DB).then(ok => {
            if (!ok) console.warn('Falha ao salvar no servidor; usando localStorage como fallback.');
        });
    }
}

async function logAudit(acao, entidade, detalhes, diff) {
    var usuario = DB.currentUser || 'Sistema';
    var detalhesStr;
    if (diff && (diff.antes || diff.depois)) {
        detalhesStr = JSON.stringify({
            descricao: detalhes || '',
            antes:  diff.antes  || {},
            depois: diff.depois || {}
        });
    } else {
        detalhesStr = typeof detalhes === 'string'
            ? detalhes
            : JSON.stringify(detalhes || '');
    }
    var entry = {
        id:        generateId(),
        timestamp: new Date().toISOString(),
        usuario:   usuario,
        acao:      acao,
        entidade:  entidade || '',
        detalhes:  detalhesStr
    };
    DB.auditoria = DB.auditoria || [];
    DB.auditoria.unshift(entry);
    if (DB.auditoria.length > 500) DB.auditoria = DB.auditoria.slice(0, 500);
    saveDB();
    if (USING_RESOURCE_APIS) {
        try {
            fetch('api/auditoria.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    usuario: usuario,
                    acao: acao,
                    entidade: entry.entidade,
                    detalhes: detalhesStr
                })
            });
        } catch(e) {}
    }
}

function showToast(msg, type='success') { 
    const t = document.getElementById('toast-notification'); 
    if(!t) return; 
    
    const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
    t.innerHTML = `<i class="fa-solid ${icon} mr-2"></i><span>${msg}</span>`;
    t.className = `fixed bottom-6 right-6 text-white px-6 py-4 rounded-xl shadow-xl z-50 toast-animate ${type==='error' ? 'bg-red-600' : 'bg-[#262261]'}`; 
    t.classList.remove('hidden'); 
    setTimeout(() => t.classList.add('hidden'), 3000); 
}


async function registerPatientLog(pacienteId, acao, descricao) {
    if (!pacienteId) return;

    try {
        await fetch('/api/log_patient_event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paciente_id: pacienteId,
                acao,
                descricao
            })
        });
    } catch (err) {
        console.error('Erro ao registrar log do paciente:', err);
    }
}

// ============================================
// NAVIGATION
// ============================================

window.login = async function () {
    const email = document.getElementById("login-email").value;
    const senha = document.getElementById("login-senha").value;

    if (!email || !senha) {
        alert("Preencha email e senha");
        return;
    }

    try {
        const res = await fetch("/api/login.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, senha })
        });

        const data = await res.json();
        console.log("Resposta login:", data);

        if (!res.ok || !data.ok) {
            alert(data.error || "Login inválido");
            return;
        }

        currentUserRole = data.user.tipo;
        DB.currentUser = data.user.nome;

        localStorage.setItem("medicore_session", JSON.stringify(data.user));

        document.getElementById("modal-login").classList.add("hidden");
        document.getElementById("header-username").innerHTML = `<i class="fa-regular fa-user mr-2"></i>${data.user.nome}`;
        document.getElementById("user-role-badge").innerHTML =
            data.user.tipo === "ADMIN"
                ? "Administrador"
                : data.user.tipo === "SECRETARIA"
                    ? "Secretaria"
                    : "Funcionário";
        const _hNome = document.getElementById("header-user-nome");
        const _hTipo = document.getElementById("header-user-tipo");
        if (_hNome) _hNome.textContent = data.user.nome;
        if (_hTipo) _hTipo.textContent = data.user.tipo === "ADMIN" ? "Administrador" : data.user.tipo === "SECRETARIA" ? "Secretaria" : "Funcionário";

        if (data.user.tipo === "SECRETARIA") {
            document.querySelectorAll('.nav-link').forEach(nav => {
                const onClick = nav.getAttribute('onclick') || '';
                if (
                    !onClick.includes("'protocolos'") &&
                    !onClick.includes("'pacientes'") &&
                    !onClick.includes("'agenda'") &&
                    !onClick.includes("'atendimento'") &&
                    !onClick.includes("'resgates-admin'")
                ) {
                    nav.style.display = 'none';
                }
            });
            showSection("agenda");
        } else {
            showSection("dashboard");
            updateDashboard();
        }
        initVisualEnhancements();
        syncAdminRewardsNav();
        syncAdminCouponNav();
        syncAdminRewardsNav();

    } catch (error) {
        console.error("Erro no login:", error);
        alert("Erro ao conectar com o servidor");
    }
};
    
    // Aplicar melhorias visuais
    setTimeout(initVisualEnhancements, 50);

function getSectionTitle(id) {
    const titles = {
        'dashboard': 'Dashboard',
        'estrategia': 'Estratégia',
        'protocolos': 'Protocolos',
        'pacientes': 'Pacientes',
        'agenda': 'Agenda',
        'atendimento': 'Atendimento',
        'estoque': 'Estoque',
        'financeiro': 'Financeiro',
        'relatorios': 'Relatórios',
        'auditoria': 'Auditoria',
        'servicos': 'Serviços'
    };
    return titles[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

// ============================================
// MODALS
// ============================================

function openModal(id, date = null) { 
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        
        if(id==='modal-agendamento') { 
            populatePatientSelect(); 
            if(date) document.getElementById('ag-data').value = date; 
        }
        if(id==='modal-paciente') { 
            document.getElementById('form-paciente').reset(); 
            document.getElementById('pac-id').value = ''; 
            const title = document.getElementById('modal-paciente-title');
            const submitBtn = document.querySelector('#form-paciente button[type="submit"]');
            if (title) title.innerText = 'Novo Paciente';
            if (submitBtn) submitBtn.innerText = 'Salvar Paciente';
        }
        if(id==='modal-novo-servico') {
            document.getElementById('form-novo-servico').reset();
            document.getElementById('servico-edit-id').value = '';
            document.getElementById('icon-picker-grid').classList.add('hidden');
            iconPickerOpen = false;
            selectIcon('fa-briefcase-medical', 'Clínica');
            document.getElementById('servico-modal-title').textContent = 'Novo Serviço';
        }
        if(id==='modal-novo-protocolo') {
            const form = document.getElementById('form-novo-protocolo');
            form.reset();
            delete form.dataset.editingId;
            document.getElementById('prot-dias').value = 30;
            document.getElementById('prot-cred-consulta').value = 0;
            document.getElementById('prot-cred-nutri').value = 0;
            document.getElementById('prot-cred-exame').value = 0;
            document.getElementById('prot-cred-proced').value = 0;
            const title = document.querySelector('#modal-novo-protocolo h3');
            const submitBtn = document.querySelector('#form-novo-protocolo button[type="submit"]');
            if (title) title.innerText = 'Novo Protocolo';
            if (submitBtn) submitBtn.innerText = 'Salvar Protocolo';
        }
        if(id==='modal-financeiro') {
            const form = document.getElementById('form-financeiro');
            if (form) form.reset();
            const idField = document.getElementById('fin-id');
            if (idField) idField.value = '';
            const title = document.getElementById('modal-financeiro-title');
            const submitBtn = document.querySelector('#form-financeiro button[type="submit"]');
            if (title) title.innerText = 'Novo Lançamento';
            if (submitBtn) submitBtn.innerText = 'Salvar lançamento';
            const dataField = document.getElementById('fin-data');
            const tipoField = document.getElementById('fin-tipo');
            const statusField = document.getElementById('fin-status');
            const origemField = document.getElementById('fin-origem');
            const metodoField = document.getElementById('fin-metodo');
            if (dataField) dataField.value = getTodayISO();
            if (tipoField) tipoField.value = 'receita';
            if (statusField) statusField.value = 'pago';
            if (origemField) origemField.value = 'Manual';
            if (metodoField) metodoField.value = 'PIX';
        }
    }
}

function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden'); 
    }
}

function resetSystem() { 
    if(confirm("Tem certeza que deseja apagar todos os dados do sistema?")) { 
        localStorage.removeItem('sgc_db'); 
        location.reload(); 
    } 
}

// ============================================
// RENDERERS
// ============================================

function updateDashboard() {
    document.getElementById('kpi-total-patients').innerText = DB.pacientes.length;
    
    const today = new Date().toLocaleDateString('fr-CA');
    document.getElementById('kpi-today-appts').innerText = DB.agendamentos.filter(a => a.data === today).length;
    document.getElementById('kpi-sales').innerText = formatCurrency(DB.financeiro.reduce((s,f)=>s+f.valor,0));
    
    // Pacientes inativos
    const limit = new Date(); 
    limit.setMonth(limit.getMonth()-3);
    const inactive = DB.pacientes.filter(p => {
        const visits = DB.atendimentos.filter(a => a.pacienteId === p.id);
        let last = visits.length > 0 ? new Date(visits.sort((a,b)=>new Date(b.data)-new Date(a.data))[0].data) : new Date(p.dataCadastro);
        return last < limit;
    });
    
    document.getElementById('inactive-count').innerText = `${inactive.length} encontrados`;
    document.getElementById('table-inactive-patients').innerHTML = inactive.map(p => {
        const lastVisit = DB.atendimentos.filter(a => a.pacienteId === p.id)
            .sort((a,b)=>new Date(b.data)-new Date(a.data))[0];
        const daysInactive = lastVisit ? Math.floor((new Date() - new Date(lastVisit.data)) / (1000*60*60*24)) : 'N/A';
        
        const lastAtend = DB.atendimentos.filter(a => a.pacienteId === p.id)
            .sort((a,b)=>new Date(b.data)-new Date(a.data))[0];
        const ultimoServico = lastAtend?.servico || lastAtend?.procedimento || '—';
        const potencial = p.protocolo || p.plano || '—';
        return `<tr class="hover:bg-[#f0fdfb] transition-colors">
            <td class="p-3 font-medium text-gray-800">
                <div class="flex items-center gap-2">
                    <span>${p.nome}</span>
                    ${(p.flags?.alergia || p.flags?.atencao || p.flags?.restricao || p.flags?.ansioso || (p.observacoes || '').trim())
                        ? '<span title="Paciente com observações importantes" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600"><i class="fa-solid fa-triangle-exclamation text-xs"></i></span>'
                        : ''}
                </div>
            </td>
            <td class="p-3 text-gray-600">${lastVisit ? formatDate(lastVisit.data) : 'Nunca'}</td>
            <td class="p-3 text-gray-500 text-xs">${ultimoServico}</td>
            <td class="p-3 text-center text-gray-500 text-xs">${potencial}</td>
            <td class="p-3 text-center">
                <button onclick="window.open('https://wa.me/55' + (p.tel||'').replace(/\D/g,''),'_blank')" class="text-xs py-1.5 px-3 rounded-lg font-semibold" style="background:#00d4b8;color:#fff;border:none;cursor:pointer;">
                    <i class="fa-brands fa-whatsapp mr-1"></i>Contatar
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderServicos() {
    const list = document.getElementById('servicos-list');
    if (!list) return;
    const servicos = DB.servicos || [];
    if (servicos.length === 0) {
        list.innerHTML = `<div class="p-10 text-center text-sm text-gray-400">Nenhum serviço cadastrado.</div>`;
        return;
    }
    list.innerHTML = servicos.map(s => `
        <div class="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors group">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style="background:#262261;">
                    <i class="fa-solid ${s.icone || 'fa-briefcase-medical'} text-lg" style="color:#00d4b8;"></i>
                </div>
                <span class="font-medium text-sm" style="color:#262261;">${s.nome}</span>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="editServico('${s.id}')" class="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Editar">
                    <i class="fa-solid fa-pen text-gray-500 text-sm"></i>
                </button>
                <button onclick="deleteServico('${s.id}')" class="p-2 hover:bg-red-100 rounded-lg transition-colors" title="Excluir">
                    <i class="fa-solid fa-trash text-red-400 text-sm"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// ── Icon Picker ──────────────────────────────────────────────
const SERVICO_ICONS = [
    { icon: 'fa-bone',              label: 'Osso' },
    { icon: 'fa-dumbbell',          label: 'Musculação' },
    { icon: 'fa-brain',             label: 'Neurologia' },
    { icon: 'fa-baby',              label: 'Infantil' },
    { icon: 'fa-wheelchair',        label: 'Mobilidade' },
    { icon: 'fa-user-group',        label: 'Grupo' },
    { icon: 'fa-heart-pulse',       label: 'Cardio' },
    { icon: 'fa-lungs',             label: 'Pulmão' },
    { icon: 'fa-stethoscope',       label: 'Consulta' },
    { icon: 'fa-microphone',        label: 'Fono' },
    { icon: 'fa-apple-whole',       label: 'Nutrição' },
    { icon: 'fa-person-walking',    label: 'Marcha' },
    { icon: 'fa-bolt',              label: 'Energia' },
    { icon: 'fa-hand-dots',         label: 'Miofascial' },
    { icon: 'fa-briefcase-medical', label: 'Clínica' },
    { icon: 'fa-syringe',           label: 'Injeção' },
    { icon: 'fa-pills',             label: 'Medicação' },
    { icon: 'fa-bandage',           label: 'Curativo' },
    { icon: 'fa-bed-pulse',         label: 'Internação' },
    { icon: 'fa-microscope',        label: 'Exame' },
    { icon: 'fa-x-ray',             label: 'Raio-X' },
    { icon: 'fa-tooth',             label: 'Odonto' },
    { icon: 'fa-eye',               label: 'Visão' },
    { icon: 'fa-ear-listen',        label: 'Audição' },
    { icon: 'fa-hand',              label: 'Mão' },
    { icon: 'fa-foot',              label: 'Pé' },
    { icon: 'fa-spine',             label: 'Coluna' },
    { icon: 'fa-person-running',    label: 'Esporte' },
    { icon: 'fa-swimming-pool',     label: 'Hidro' },
    { icon: 'fa-spa',               label: 'Relaxamento' },
    { icon: 'fa-leaf',              label: 'Natural' },
    { icon: 'fa-fire-flame-curved', label: 'Termoterapia' },
    { icon: 'fa-snowflake',         label: 'Crioterapia' },
    { icon: 'fa-magnet',            label: 'Magnetoterapia' },
    { icon: 'fa-wave-square',       label: 'Eletroterapia' },
    { icon: 'fa-clock',             label: 'Tempo' },
    { icon: 'fa-star',              label: 'Destaque' },
    { icon: 'fa-plus',              label: 'Geral' },
    { icon: 'fa-circle-plus',       label: 'Novo' },
    { icon: 'fa-notes-medical',     label: 'Prontuário' },
    { icon: 'fa-kit-medical',       label: 'Kit' },
    { icon: 'fa-user-doctor',       label: 'Médico' },
    { icon: 'fa-child',             label: 'Criança' },
    { icon: 'fa-person-cane',       label: 'Idoso' },
    { icon: 'fa-weight-scale',      label: 'Peso' },
    { icon: 'fa-droplet',           label: 'Hidratação' },
    { icon: 'fa-sun',               label: 'Fototerapia' },
    { icon: 'fa-shield-heart',      label: 'Prevenção' },
];

let iconPickerOpen = false;

function buildIconPicker() {
    renderIconGrid(SERVICO_ICONS);
}

function renderIconGrid(icons) {
    const container = document.getElementById('icon-picker-items');
    if (!container) return;
    const selected = document.getElementById('servico-icone').value;
    container.innerHTML = icons.map(({ icon, label }) => `
        <button type="button" onclick="selectIcon('${icon}', '${label}')"
            title="${label}"
            class="flex flex-col items-center gap-1 p-2 rounded-lg transition-all hover:bg-gray-100 ${icon === selected ? 'ring-2 ring-[#00d4b8] bg-[#e0faf6]' : ''}">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background:#262261;">
                <i class="fa-solid ${icon} text-sm" style="color:#00d4b8;"></i>
            </div>
            <span class="text-[9px] text-gray-500 leading-none text-center truncate w-full">${label}</span>
        </button>
    `).join('');
}

function filterIcons(query) {
    const q = query.toLowerCase();
    const filtered = q ? SERVICO_ICONS.filter(i => i.label.toLowerCase().includes(q) || i.icon.includes(q)) : SERVICO_ICONS;
    renderIconGrid(filtered);
}

function toggleIconPicker() {
    const grid = document.getElementById('icon-picker-grid');
    const search = document.getElementById('icon-search');
    iconPickerOpen = !iconPickerOpen;
    if (iconPickerOpen) {
        grid.classList.remove('hidden');
        buildIconPicker();
        if (search) { search.value = ''; search.focus(); }
    } else {
        grid.classList.add('hidden');
    }
}

function selectIcon(icon, label) {
    document.getElementById('servico-icone').value = icon;
    document.getElementById('servico-icone-preview').className = `fa-solid ${icon}`;
    document.getElementById('servico-icone-preview').style.color = '#00d4b8';
    document.getElementById('servico-icone-label').textContent = label || icon.replace('fa-','');
    document.getElementById('icon-picker-grid').classList.add('hidden');
    iconPickerOpen = false;
}

function saveServico(e) {
    e.preventDefault();
    const id    = document.getElementById('servico-edit-id').value;
    const nome  = document.getElementById('servico-nome').value.trim();
    const icone = (document.getElementById('servico-icone').value.trim() || 'fa-briefcase-medical').replace(/^fa-solid\s+/, '');
    if (!nome) return;
    if (id) {
        const s = DB.servicos.find(x => x.id === id);
        if (s) { s.nome = nome; s.icone = icone; }
    } else {
        DB.servicos.push({ id: 's' + Date.now(), nome, icone });
    }
    saveDB();
    renderServicos();
    closeModal('modal-novo-servico');
    showToast(id ? 'Serviço atualizado!' : 'Serviço cadastrado!');
}

function editServico(id) {
    const s = DB.servicos.find(x => x.id === id);
    if (!s) return;
    document.getElementById('servico-edit-id').value = s.id;
    document.getElementById('servico-nome').value    = s.nome;
    document.getElementById('servico-modal-title').textContent = 'Editar Serviço';
    openModal('modal-novo-servico');
    // Atualiza preview do ícone
    const icone = s.icone || 'fa-briefcase-medical';
    const meta  = SERVICO_ICONS.find(i => i.icon === icone);
    selectIcon(icone, meta ? meta.label : icone.replace('fa-',''));
}

function deleteServico(id) {
    if (!confirm('Excluir este serviço?')) return;
    DB.servicos = DB.servicos.filter(s => s.id !== id);
    saveDB();
    renderServicos();
    showToast('Serviço removido.');
}

function renderProtocolos() {
    document.getElementById('table-protocolos-body').innerHTML = (DB.protocolos||[]).map(p => `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="p-3 font-bold text-gray-900">${p.nome}</td>
            <td class="p-3 text-sm">
                ${Object.entries(p.servicos || {}).map(([k,v]) => `<span style="background:#262261;color:#fff;padding:0.2rem 0.6rem;border-radius:100px;font-size:0.7rem;font-weight:600;display:inline-flex;margin:0.1rem;" >${v}x ${k}</span>`).join('')}
            </td>
            <td class="p-3 text-center text-gray-600">${p.duracao} dias</td>
            <td class="p-3 text-right font-mono font-bold text-gray-900">${formatCurrency(p.valor)}</td>
            <td class="p-3 text-center">
                <button class="text-gray-400 hover:text-gray-700 transition-colors mx-1" onclick="editProtocol('${p.id}')" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="text-red-500 hover:text-red-700 transition-colors mx-1" onclick="deleteProtocol('${p.id}')" title="Excluir">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderPacientes() {
    const s = document.getElementById('search-paciente').value.toLowerCase();
    document.getElementById('table-pacientes-body').innerHTML = DB.pacientes
        .filter(p => (p.nome||'').toLowerCase().includes(s) || (p.cpf||'').includes(s))
        .map(p => `
        ${(() => {
            const lastAtend = (DB.atendimentos||[]).filter(a => a.pacienteId === p.id).sort((a,b) => new Date(b.data)-new Date(a.data))[0];
            const lastVisitDate = lastAtend ? lastAtend.data : null;
            const daysInactive = lastVisitDate ? Math.floor((new Date() - new Date(lastVisitDate)) / (1000*60*60*24)) : null;
            const isAtivo = daysInactive !== null && daysInactive <= 90;
            const statusBadge = lastVisitDate
                ? (isAtivo
                    ? '<span style="background:#d1fae5;color:#059669;padding:0.2rem 0.7rem;border-radius:100px;font-size:0.7rem;font-weight:600;">Ativo</span>'
                    : '<span style="background:#f3f4f6;color:#6b7280;padding:0.2rem 0.7rem;border-radius:100px;font-size:0.7rem;font-weight:600;">Inativo</span>')
                : '<span style="background:#f3f4f6;color:#6b7280;padding:0.2rem 0.7rem;border-radius:100px;font-size:0.7rem;font-weight:600;">Novo</span>';
            const tipoBg   = p.tipoAtendimento === 'Particular' ? '#dbeafe' : p.tipoAtendimento === 'Clube' ? '#ede9fe' : '#dcfce7';
            const tipoText = p.tipoAtendimento === 'Particular' ? '#1d4ed8' : p.tipoAtendimento === 'Clube' ? '#7c3aed' : '#15803d';
            return `<tr class="hover:bg-gray-50 transition-colors">
            <td class="p-3 font-semibold text-gray-900">${p.nome}</td>
            <td class="p-3 text-gray-500 text-xs">
                ${p.tel ? `<div><i class="fa-solid fa-phone text-gray-400 mr-1"></i>${p.tel}</div>` : ''}
                ${p.email ? `<div><i class="fa-solid fa-envelope text-gray-400 mr-1"></i>${p.email}</div>` : ''}
                ${!p.tel && !p.email ? '—' : ''}
            </td>
            <td class="p-3"><span style="background:${tipoBg};color:${tipoText};padding:0.2rem 0.6rem;border-radius:100px;font-size:0.7rem;font-weight:600;">${p.tipoAtendimento || '—'}</span></td>
            <td class="p-3 text-gray-500">${lastVisitDate ? formatDate(lastVisitDate) : '—'}</td>
            <td class="p-3 text-center">${statusBadge}</td>
            <td class="p-3 text-center">
                <button onclick="editPatient('${p.id}')" class="text-gray-400 hover:text-gray-700 transition-colors mx-1" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="openPatientReport('${p.id}')" class="text-gray-400 hover:text-gray-700 transition-colors mx-1" title="Prontuário">
                    <i class="fa-solid fa-file-medical"></i>
                </button>
                <button onclick="renderPatientQuickReport('${p.id}')" class="text-gray-400 hover:text-gray-700 transition-colors mx-1" title="Resumo Rápido">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
                ${currentUserRole === 'ADMIN' ? `
                <button onclick="deletePatient('${p.id}')" class="text-red-500 hover:text-red-700 transition-colors mx-1" title="Excluir Paciente">
                    <i class="fa-solid fa-trash"></i>
                </button>` : ''}
            </td>
        </tr>`;
        })()}
    `).join('');
}

let selectedCalendarDate = null;

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('calendar-month-year').innerHTML = `${monthNames[calendarDate.getMonth()]} <span class="text-gray-500 font-light">${calendarDate.getFullYear()}</span>`;

    const year = calendarDate.getFullYear(),
          month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(),
          daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toLocaleDateString('fr-CA');

    // Se não há data selecionada ainda, pré-seleciona hoje (se estiver no mês atual)
    if (!selectedCalendarDate) {
        const t = new Date();
        if (t.getFullYear() === year && t.getMonth() === month) {
            selectedCalendarDate = today;
        }
    }

    // Células vazias antes do 1º dia
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="calendar-cell-figma other-month-figma"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday    = dateStr === today;
        const isSelected = dateStr === selectedCalendarDate;
        const events = DB.agendamentos.filter(a => {
            const rawDate = a.data || a.data_consulta || '';
            return String(rawDate).slice(0, 10) === dateStr && a.status !== 'Cancelado';
        });
        const hasEvents = events.length > 0;

        let classes = 'calendar-cell-figma';
        if (isSelected)       classes += ' is-selected';
        else if (hasEvents)   classes += ' has-events';
        if (isToday && !isSelected) classes += ' is-today-marker';

        const dot = (hasEvents && !isSelected)
            ? `<span class="calendar-dot-figma"></span>` : '';

        grid.innerHTML += `<button class="${classes}" onclick="selectCalendarDay('${dateStr}')">${day}${dot}</button>`;
    }

    // Renderizar sidebar com data selecionada
    if (selectedCalendarDate) {
        renderAgendaSidebar(selectedCalendarDate);
    }

    // Fila de espera (mantido para compatibilidade)
    const waiting = DB.agendamentos.filter(a => a.status === 'Aguardando' && a.status !== 'Cancelado')
        .sort((a,b) => a.hora.localeCompare(b.hora));
    const filaEl = document.getElementById('fila-espera-list');
    if (filaEl) {
        filaEl.innerHTML = waiting.length > 0
            ? waiting.map(ag => `
                <div onclick="showSection('atendimento'); startConsultation('${ag.id}')"
                     class="bg-white border-2 border-[#e0f7f4] hover:border-[#00d4b8] p-4 rounded-2xl shadow-sm cursor-pointer min-w-[220px] transition-all hover:shadow-md">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-[#FCF7F9] rounded-full flex items-center justify-center">
                            <i class="fa-solid fa-user-clock text-[#00d4b8]"></i>
                        </div>
                        <div>
                            <div class="font-bold text-gray-800">${ag.pacienteNome}</div>
                            <div class="text-xs text-gray-500">${ag.hora} • ${ag.prioridade}</div>
                        </div>
                    </div>
                </div>
            `).join('')
            : '<div class="text-gray-400 text-sm py-4">Nenhum paciente aguardando</div>';
    }
}

function selectCalendarDay(dateStr) {
    selectedCalendarDate = dateStr;
    renderCalendar();
}

function renderAgendaSidebar(dateStr) {
    const titleEl = document.getElementById('calendar-sidebar-title');
    const listEl  = document.getElementById('calendar-sidebar-list');
    if (!titleEl || !listEl) return;

    // Formatar título: "Dia DD/MM"
    const [y, m, d] = dateStr.split('-');
    titleEl.textContent = `Dia ${d}/${m}`;

    const apts = DB.agendamentos.filter(a => {
        const rawDate = a.data || a.data_consulta || '';
        return String(rawDate).slice(0, 10) === dateStr && a.status !== 'Cancelado';
    }).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

    if (apts.length === 0) {
        listEl.innerHTML = `<p class="text-sm text-gray-400 text-center py-6">Nenhum agendamento neste dia.</p>`;
        return;
    }

    listEl.innerHTML = apts.map(apt => {
        const paciente  = apt.pacienteNome || apt.paciente || '—';
        const servico   = apt.servico || apt.tipoConsulta || apt.especialidade || '';
        const medico    = apt.medico || apt.profissional || '';
        const hora      = apt.hora || '';
        const statusBadge = apt.status && apt.status !== 'Agendado'
            ? `<span class="text-xs px-2 py-0.5 rounded-full ml-1" style="background:#f3f4f6;color:#6b7280;">${apt.status}</span>` : '';

        return `
        <div class="agenda-apt-card" onclick="openCalendarEventMenu('${apt.id}')">
            <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-bold" style="color:#00d4b8;">${hora}</span>
                <span class="text-xs text-gray-500">${medico}${statusBadge}</span>
            </div>
            <p class="font-medium text-sm" style="color:#262261;">${paciente}</p>
            ${servico ? `<p class="text-xs text-gray-500 mt-0.5">${servico}</p>` : ''}
        </div>`;
    }).join('');
}

function changeMonth(step) { 
    calendarDate.setMonth(calendarDate.getMonth() + step); 
    renderCalendar(); 
}

function goToToday() { 
    calendarDate = new Date(); 
    renderCalendar(); 
}

function checkIn(id) { 
    const ag = DB.agendamentos.find(a => a.id === id); 
    if(ag && ag.status === 'Agendado') { 
        ag.status = 'Aguardando'; 
        saveDB(); 
        renderCalendar(); 
        showToast(`Check-in realizado: ${ag.pacienteNome}`); 
    } 
}

function renderAtendimentoScreen() {
    const today = new Date().toLocaleDateString('fr-CA');
    const list = DB.agendamentos.filter(a => a.data === today && a.status !== 'Finalizado' && a.status !== 'Cancelado')
        .sort((a,b) => {
            if(a.status === 'Em Atendimento') return -1;
            if(b.status === 'Em Atendimento') return 1;
            return a.hora.localeCompare(b.hora);
        });
    
    document.getElementById('today-appointments-list').innerHTML = list.length > 0
        ? list.map(a => `
            <div onclick="startConsultation('${a.id}')" 
                 class="p-4 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-md
                        ${a.status === 'Em Atendimento' 
                            ? 'border-[#6F4B36] bg-[#FCF7F9]' 
                            : 'border-[#CBE5F7] hover:border-[#6F4B36] bg-white'}">
                <div class="flex items-center justify-between mb-2">
                    <div class="font-bold text-gray-800">${a.pacienteNome}</div>
                    <span class="badge ${a.prioridade === 'Emergência' ? 'badge-primary' : 'badge-secondary'} text-xs">
                        ${a.prioridade}
                    </span>
                </div>
                <div class="flex justify-between items-center">
                    <div class="text-sm text-gray-500">
                        <i class="fa-regular fa-clock mr-1"></i>${a.hora}
                    </div>
                    <div class="text-xs ${a.status === 'Em Atendimento' ? 'text-[#6F4B36] font-bold' : 'text-gray-400'}">
                        ${a.status === 'Em Atendimento' ? '⚡ Em atendimento' : '⏳ Aguardando'}
                    </div>
                </div>
            </div>
        `).join('')
        : '<div class="text-center py-8 text-gray-400 bg-[#FCF7F9] rounded-2xl">Nenhum atendimento agendado para hoje</div>';
    
    if(currentConsultationId) {
        const appt = DB.agendamentos.find(a => a.id === currentConsultationId);
        if (appt) {
            const p = DB.pacientes.find(x => x.id === appt.pacienteId);
            if (p) {
                document.getElementById('area-clinica-empty').classList.add('hidden');
                document.getElementById('area-clinica-active').classList.remove('hidden');
                document.getElementById('current-patient-name').innerText = appt.pacienteNome;
                document.getElementById('current-patient-cpf').innerText = p.cpf;
                document.getElementById('atendimento-tipo').innerHTML = `<i class="fa-regular fa-stethoscope mr-1"></i>${appt.tipo}`;
                document.getElementById('atendimento-valor').innerText = formatCurrency(appt.valor);
                
                // Badge de prioridade
                const priorityBadge = document.getElementById('atendimento-prioridade-badge');
                priorityBadge.innerText = appt.prioridade;
                priorityBadge.className = `badge ${appt.prioridade === 'Emergência' ? 'badge-primary' : 'badge-secondary'}`;
                
                // Populate selects
                const medSelect = document.getElementById('consult-medication');
                if(medSelect.options.length <= 1) {
                    medSelect.innerHTML = '<option value="">Selecione um medicamento...</option>' + 
                        DB.estoque.map(e => `<option value="${e.id}">${e.nome} - ${formatCurrency(e.preco)}</option>`).join('');
                }
                
                const examSelect = document.getElementById('consult-exam');
                if(examSelect.options.length <= 1) {
                    examSelect.innerHTML = '<option value="">Selecione um exame...</option>' + 
                        DB.catalogoExames.map(e => `<option value="${e.id}">${e.nome} - ${formatCurrency(e.preco)}</option>`).join('');
                }
                
                // Anamnese preview
                try {
                    const preview = document.getElementById('anamnese-preview');
                    const lastAnam = (DB.avaliacoes||[])
                        .filter(a => a.pacienteId === p.id)
                        .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                    
                    if(preview) {
                        if(lastAnam) {
                            preview.innerHTML = `
                                <div class="flex justify-between items-start">
                                    <div>
                                        <span class="font-bold text-[#6F4B36]">${new Date(lastAnam.timestamp).toLocaleString()}</span>
                                        <button class="ml-2 text-sm text-[#6F4B36] underline hover:no-underline" onclick="openAnamneseHistory('${p.id}')">
                                            Ver histórico
                                        </button>
                                    </div>
                                </div>
                                <div class="mt-2 text-gray-600">${(lastAnam.notes || '').slice(0, 200)}${(lastAnam.notes || '').length > 200 ? '...' : ''}</div>
                            `;
                        } else {
                            preview.innerHTML = '<span class="text-gray-400">Nenhum registro de anamnese encontrado.</span>';
                        }
                    }
                    
                    const histEl = document.getElementById('historico-recente-list');
                    if(histEl) {
                        const recent = (DB.avaliacoes||[])
                            .filter(a => a.pacienteId === p.id)
                            .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
                            .slice(0, 5);
                        
                        if(recent.length === 0) {
                            histEl.innerHTML = '<div class="text-sm text-gray-400 p-3 bg-[#FCF7F9] rounded-xl">Nenhum registro de anamnese.</div>';
                        } else {
                            histEl.innerHTML = recent.map(r => `
                                <div class="p-3 bg-[#FCF7F9] rounded-xl border border-[#CBE5F7] border-opacity-30 flex justify-between items-center">
                                    <div class="text-sm">
                                        <div class="font-medium text-gray-800">${new Date(r.timestamp).toLocaleString()}</div>
                                        <div class="text-xs text-gray-500 mt-1">${(r.notes || '').slice(0, 100)}${(r.notes || '').length > 100 ? '...' : ''}</div>
                                    </div>
                                    <button class="btn-secondary text-xs !py-1.5 !px-3" onclick="viewAnamneseDetail('${r.id}'); openModal('modal-anamnese-history');">
                                        <i class="fa-solid fa-eye mr-1"></i>Ver
                                    </button>
                                </div>
                            `).join('');
                        }
                    }
                } catch(err) { 
                    console.error('preview render error', err); 
                }

                updateListsAndTotals();
            }
        }
    } else {
        document.getElementById('area-clinica-empty').classList.remove('hidden');
        document.getElementById('area-clinica-active').classList.add('hidden');
    }
}

function startConsultation(id) {
    if(currentConsultationId && currentConsultationId !== id) {
        if(!confirm("Já existe um atendimento em andamento. Deseja trocar de paciente?")) return;
    }
    
    const appt = DB.agendamentos.find(a => a.id === id);
    if (appt) {
        appt.status = 'Em Atendimento';
        currentConsultationId = id; 
        tempPrescription = []; 
        tempExams = []; 
        tempAnamnese = null;

        const paciente = DB.pacientes.find(p => p.id === appt.pacienteId);

        saveDB(); 
        renderAtendimentoScreen();
        renderAttendancePatientNotes(paciente);
        showToast(`Atendimento iniciado: ${appt.pacienteNome}`);
    }
}

function updateListsAndTotals() {
    document.getElementById('prescription-list').innerHTML = tempPrescription.length > 0
        ? tempPrescription.map((i,x) => `
            <div class="flex justify-between items-center py-2 border-b border-[#CBE5F7] border-opacity-30">
                <div>
                    <span class="font-medium text-gray-800">${i.nome}</span>
                    <span class="text-sm text-gray-500 ml-2">${i.qtd}x ${formatCurrency(i.total)}</span>
                </div>
                <button onclick="removeTempItem('med',${x})" class="text-red-500 hover:text-red-700 transition-colors">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `).join('')
        : '<div class="text-gray-400 text-center py-4">Nenhum medicamento prescrito</div>';
    
    document.getElementById('exams-list').innerHTML = tempExams.length > 0
        ? tempExams.map((i,x) => `
            <div class="flex justify-between items-center py-2 border-b border-[#CBE5F7] border-opacity-30">
                <div>
                    <span class="font-medium text-gray-800">${i.nome}</span>
                    <span class="text-sm text-gray-500 ml-2">${formatCurrency(i.preco)}</span>
                </div>
                <button onclick="removeTempItem('exam',${x})" class="text-red-500 hover:text-red-700 transition-colors">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `).join('')
        : '<div class="text-gray-400 text-center py-4">Nenhum exame solicitado</div>';
    
    const totMeds = tempPrescription.reduce((s,i) => s + i.total, 0);
    const totExams = tempExams.reduce((s,i) => s + i.preco, 0);
    const appt = DB.agendamentos.find(a => a.id === currentConsultationId);
    
    document.getElementById('total-meds').innerText = formatCurrency(totMeds);
    document.getElementById('total-exams').innerText = formatCurrency(totExams);
    document.getElementById('total-final').innerText = formatCurrency((appt?.valor || 0) + totMeds + totExams);
}

window.removeTempItem = (t, i) => { 
    if(t === 'med') tempPrescription.splice(i,1); 
    else tempExams.splice(i,1); 
    updateListsAndTotals(); 
};

function addMedicationToPrescription() {
    const id = document.getElementById('consult-medication').value; 
    const qty = parseInt(document.getElementById('consult-qty').value);
    const item = DB.estoque.find(e => e.id === id);
    
    if(item) { 
        tempPrescription.push({
            id: item.id, 
            nome: item.nome, 
            qtd: qty, 
            total: item.preco * qty
        }); 
        updateListsAndTotals(); 
        showToast(`${item.nome} adicionado à prescrição`);
    } else {
        showToast('Selecione um medicamento', 'error');
    }
}

function addExamToConsultation() {
    const id = document.getElementById('consult-exam').value;
    const item = DB.catalogoExames.find(e => e.id === id);
    
    if(item) { 
        tempExams.push({
            id: item.id, 
            nome: item.nome, 
            preco: item.preco
        }); 
        updateListsAndTotals(); 
        showToast(`${item.nome} adicionado à solicitação`);
    } else {
        showToast('Selecione um exame', 'error');
    }
}

function proceedToPayment() { 
    const totalRaw = String(document.getElementById('total-final').innerText || '0')
        .replace('R$', '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
    const totalBase = parseFloat(totalRaw) || 0;

    updatePaymentModalWithRedemption(totalBase);
    openModal('modal-pagamento'); 
}

async function confirmPayment() {
    const appt = DB.agendamentos.find(a => a.id === currentConsultationId);
    if (appt) {
        appt.status = 'Finalizado';
        
        DB.financeiro.push({ 
            id: window.__editingAppointmentId || generateId(), 
            data: new Date().toISOString(), 
            pacienteId: appt.pacienteId, 
            pacienteNome: appt.pacienteNome, 
            tipo: appt.tipo, 
            valor: parseFloat(String(document.getElementById('pay-total-val').innerText || '0').replace('R$', '').replace(/\./g, '').replace(',', '.')), 
            metodo: document.getElementById('pay-method').value,
            parcelas: parseInt(document.getElementById('pay-installments').value) || 1
        });
        
        DB.atendimentos.push({ 
            id: window.__editingAppointmentId || generateId(), 
            agendamentoId: appt.id, 
            pacienteId: appt.pacienteId, 
            data: appt.data, 
            prescricao: tempPrescription, 
            exames: tempExams,
            anamnese: tempAnamnese || {} 
        });
        
        saveDB();
        if (USING_RESOURCE_APIS) {
            await apiUpsertResource('agendamentos', appt);
            const lastFinance = DB.financeiro[DB.financeiro.length - 1];
            if (lastFinance) await apiUpsertResource('financeiro', lastFinance);
            const lastAtend = DB.atendimentos[DB.atendimentos.length - 1];
            if (lastAtend) await apiUpsertResource('atendimentos', lastAtend);
        }

        try {
            const tipoAtendimento = String(appt?.tipo || '').toLowerCase();
            const eventType = tipoAtendimento === 'procedimento' ? 'procedimento' : 'consulta';

            await fetch('/api-clube/award_by_patient.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    patient_id: appt.pacienteId,
                    event_type: eventType,
                    referencia_id: appt.id || ''
                })
            });
        } catch (err) {
            console.error('Erro ao pontuar atendimento finalizado no Clube:', err);
        }

        if (window.__activeRedemption) {
            try {
                await fetch('/api-clube/admin_redemptions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        id: Number(window.__activeRedemption.id),
                        status: 'utilizado',
                        observacao: 'Utilizado no pagamento do MediCore'
                    })
                });
            } catch (err) {
                console.error('Erro ao atualizar resgate utilizado:', err);
            }
            window.__activeRedemption = null;
        }

        const medsDesc = tempPrescription.length
            ? tempPrescription.map(i => `${i.nome} (${i.qtd}x)`).join(', ')
            : 'Nenhum medicamento';
        const examsDesc = tempExams.length
            ? tempExams.map(i => i.nome).join(', ')
            : 'Nenhum exame';

        await registerPatientLog(
            appt.pacienteId,
            'Atendimento finalizado',
            `Atendimento finalizado em ${formatDate(appt.data)} • ${appt.tipo} • Valor ${formatCurrency(parseFloat(String(document.getElementById('pay-total-val').innerText || '0').replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0)} • Exames: ${examsDesc} • Prescrição: ${medsDesc}`
        );

        const payInfo = document.getElementById('pay-redemption-info');
        if (payInfo) {
            payInfo.classList.add('hidden');
            payInfo.innerHTML = '';
        }

        closeModal('modal-pagamento'); 
        logAudit('Criou', 'Atendimento', DB.currentPatient?.nome || '');
        showToast(`Atendimento finalizado com sucesso!`);
        currentConsultationId = null; 
        renderAtendimentoScreen();
    }
}

// ============================================
// FORMS
// ============================================

document.addEventListener('submit', async (e) => {
    if (e.target.id === 'form-resgate-admin') {
        e.preventDefault();

        const payload = {
            id: Number(document.getElementById('redeem-admin-id').value || 0),
            status: document.getElementById('redeem-admin-status').value,
            observacao: document.getElementById('redeem-admin-observacao').value.trim()
        };

        try {
            const res = await fetch('/api-clube/admin_redemptions.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao atualizar resgate');

            closeModal('modal-resgate-admin');
            alert(data.message || 'Resgate atualizado com sucesso');
            await loadRedemptionsAdminSection();
        } catch (err) {
            alert(err.message || 'Erro ao atualizar resgate');
        }
        return;
    }

    if (e.target.id === 'form-recompensa-admin') {
        e.preventDefault();

        try {
            const payload = {
                id: document.getElementById('reward-admin-id').value ? Number(document.getElementById('reward-admin-id').value) : 0,
                nome: document.getElementById('reward-admin-nome').value.trim(),
                descricao: document.getElementById('reward-admin-descricao').value.trim(),
                pontos: Number(document.getElementById('reward-admin-pontos').value || 0),
                tipo: document.getElementById('reward-admin-tipo').value,
                estoque: document.getElementById('reward-admin-estoque').value.trim(),
                ativo: document.getElementById('reward-admin-ativo').value === '1'
            };

            if (!payload.nome || payload.pontos <= 0) {
                showToast('Preencha nome e pontos da recompensa', 'error');
                return;
            }

            const res = await fetch('/api-clube/admin_rewards.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar recompensa');

            closeModal('modal-recompensa-admin');
            logAudit('Criou', 'Recompensa', payload?.nome || '');
            showToast(data.message || 'Recompensa salva com sucesso');
            await loadRewardsAdminSection();
        } catch (err) {
            showToast(err.message || 'Erro ao salvar recompensa', 'error');
        }
        return;
    }

    e.preventDefault();
    
    if(e.target.id === 'form-paciente') {
        const editingId = document.getElementById('pac-id').value;
        const existing = DB.pacientes.find(p => p.id === editingId);
        const p = { 
            id: editingId || generateId(), 
            nome: document.getElementById('pac-nome').value, 
            cpf: document.getElementById('pac-cpf').value, 
            dataNascimento: document.getElementById('pac-nasc').value, 
            endereco: document.getElementById('pac-endereco').value, 
            tipoAtendimento: document.getElementById('pac-tipo').value, 
            tel: document.getElementById('pac-tel').value,
            email: document.getElementById('pac-email').value,
            observacoes: document.getElementById('pac-observacoes')?.value?.trim() || '',
            flags: {
                alergia: document.getElementById('pac-flag-alergia')?.checked || false,
                atencao: document.getElementById('pac-flag-atencao')?.checked || false,
                restricao: document.getElementById('pac-flag-restricao')?.checked || false,
                ansioso: document.getElementById('pac-flag-ansioso')?.checked || false
            },
            lgpdConsent: document.getElementById('pac-lgpd')?.checked || false,
            dataCadastro: existing?.dataCadastro || new Date().toISOString() 
        };
        
        if (existing) {
            const _pacOld = { ...existing };
            Object.assign(existing, p);
            DB.agendamentos.forEach(a => {
                if (a.pacienteId === existing.id) a.pacienteNome = existing.nome;
            });
            DB.financeiro.forEach(f => {
                if (f.pacienteId === existing.id) f.pacienteNome = existing.nome;
            });
            saveDB();
            if (USING_RESOURCE_APIS) await apiUpsertResource('pacientes', existing);
            renderPacientes(); 
            updateDashboard();
            closeModal('modal-paciente');
            const _pacDiff = { antes: {}, depois: {} };
            ['nome','email','tel','cpf','dataNascimento','endereco','tipoAtendimento','observacoes'].forEach(k => {
                if (String(_pacOld[k] ?? '') !== String(p[k] ?? '')) {
                    _pacDiff.antes[k]  = _pacOld[k] ?? '';
                    _pacDiff.depois[k] = p[k] ?? '';
                }
            });
            logAudit('Editou', 'Paciente', p.nome, _pacDiff);
            showToast(`Paciente ${p.nome} atualizado com sucesso!`);
        } else {
            DB.pacientes.push(p); 
            saveDB();
            if (USING_RESOURCE_APIS) await apiUpsertResource('pacientes', p);
            renderPacientes(); 
            updateDashboard();
            closeModal('modal-paciente');
            logAudit('Criou', 'Paciente', p.nome);
            showToast(`Paciente ${p.nome} cadastrado com sucesso!`);
        }
    }
    
    if(e.target.id === 'form-agendamento') {
        const pacienteId = document.getElementById('ag-paciente').value;
        const paciente = DB.pacientes.find(p => p.id === pacienteId);

        if (!paciente) {
            showToast('Selecione um paciente', 'error');
            return;
        }

        const dataSelecionada = document.getElementById('ag-data').value;
        const horaSelecionada = document.getElementById('ag-hora').value;

        if (!dataSelecionada || !horaSelecionada) {
            showToast('Preencha data e hora', 'error');
            return;
        }

        const sessoes = parseInt(document.getElementById('ag-qtd-sessoes').value) || 1;
        const editingId = window.__editingAppointmentId || null;

        if (editingId) {
            if (isSlotOccupied(dataSelecionada, horaSelecionada, editingId)) {
                renderTimeSuggestions(dataSelecionada, horaSelecionada, editingId);
                showToast('Esse horário já está ocupado', 'error');
                return;
            }

            const ag = {
                id: editingId,
                group_id: (DB.agendamentos.find(a => a.id === editingId) || {}).group_id || '',
                pacienteId: pacienteId,
                pacienteNome: paciente.nome,
                data: dataSelecionada,
                hora: horaSelecionada,
                motivo: document.getElementById('ag-motivo').value,
                tipo: document.getElementById('ag-tipo').value,
                valor: parseFloat(document.getElementById('ag-valor').value),
                prioridade: document.getElementById('ag-prioridade').value,
                status: (DB.agendamentos.find(a => a.id === editingId) || {}).status || 'Agendado',
                sessoes: 1
            };

            const idx = DB.agendamentos.findIndex(a => a.id === editingId);
            if (idx !== -1) DB.agendamentos[idx] = ag;

            saveDB();
            if (USING_RESOURCE_APIS) await apiUpsertResource('agendamentos', ag);

            await registerPatientLog(
                ag.pacienteId,
                'Agendamento atualizado',
                `Agendamento atualizado para ${formatDate(ag.data)} às ${ag.hora} • ${ag.tipo}`
            );

            window.__editingAppointmentId = null;
            for (const item of agsCriados) {
                await registerPatientLog(
                    item.pacienteId,
                    'Agendamento criado',
                    `Agendamento criado para ${formatDate(item.data)} às ${item.hora} • ${item.tipo}`
                );
            }

            const box = document.getElementById('ag-sugestoes');
            if (box) box.innerHTML = '';

            renderCalendar();
            updateDashboard();
            closeModal('modal-agendamento');
            logAudit('Editou', 'Agendamento', paciente.nome);
            showToast(`Agendamento atualizado para ${paciente.nome}`);
        } else {
            const agsCriados = [];
            const groupId = `grp_${generateId()}`;

            for (let i = 0; i < sessoes; i++) {
                const baseDate = new Date(dataSelecionada + 'T12:00:00');
                baseDate.setDate(baseDate.getDate() + (i * 7));

                const yyyy = baseDate.getFullYear();
                const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
                const dd = String(baseDate.getDate()).padStart(2, '0');
                const dataFormatada = `${yyyy}-${mm}-${dd}`;

                if (isSlotOccupied(dataFormatada, horaSelecionada, null)) {
                    if (i === 0) {
                        renderTimeSuggestions(dataSelecionada, horaSelecionada, null);
                    }
                    showToast(`Horário ocupado em ${dataFormatada} às ${horaSelecionada}`, 'error');
                    return;
                }

                const novoAg = {
                    id: `${generateId()}_${i}`,
                    group_id: groupId,
                    pacienteId: pacienteId,
                    pacienteNome: paciente.nome,
                    data: dataFormatada,
                    hora: horaSelecionada,
                    motivo: document.getElementById('ag-motivo').value,
                    tipo: document.getElementById('ag-tipo').value,
                    valor: parseFloat(document.getElementById('ag-valor').value),
                    prioridade: document.getElementById('ag-prioridade').value,
                    status: 'Agendado',
                    sessoes: 1
                };

                DB.agendamentos.push(novoAg);
                agsCriados.push(novoAg);

                if (USING_RESOURCE_APIS) {
                    await apiUpsertResource('agendamentos', novoAg);
                }
            }

            if (USING_RESOURCE_APIS) {
                await loadDB();
            } else {
                saveDB();
            }

            try {
                const pacienteObj = DB.pacientes.find(p => p.id === pacienteId);
                if (pacienteObj && pacienteObj.email && agsCriados.length > 0) {
                    await fetch('/api/send_appointment_email.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            nome: pacienteObj.nome,
                            email: pacienteObj.email,
                            appointment_id: agsCriados[0].id,
                            appointment_group_id: groupId,
                            sessoes: agsCriados.map(item => ({
                                id: item.id,
                                data: item.data,
                                hora: item.hora
                            }))
                        })
                    });
                    console.log('Email consolidado enviado para', pacienteObj.email);
                }
            } catch (err) {
                console.error('Erro ao enviar email consolidado:', err);
            }

            const box = document.getElementById('ag-sugestoes');
            if (box) box.innerHTML = '';

            renderCalendar();
            updateDashboard();
            closeModal('modal-agendamento');
            logAudit('Criou', 'Agendamento', `${agsCriados.length}x para ${paciente.nome}`);
            showToast(`${agsCriados.length} agendamento(s) criado(s) para ${paciente.nome}`);
        }
    }


    if(e.target.id === 'form-venda-protocolo') {
        const paciente = DB.pacientes.find(p => p.id === currentQuickPatientId);
        const protocolo = DB.protocolos.find(p => p.id === document.getElementById('sell-prot-select').value);

        if (!paciente) {
            showToast('Paciente não encontrado', 'error');
            return;
        }

        if (!protocolo) {
            showToast('Selecione um protocolo', 'error');
            return;
        }

        const desconto = Math.max(0, parseFloat(document.getElementById('sell-prot-desconto').value || 0));
        const valorBase = Number(protocolo.valor || 0);
        const valorFinal = Math.max(0, valorBase - desconto);
        const observacao = document.getElementById('sell-prot-obs').value || '';

        paciente.protocolosContratados = paciente.protocolosContratados || [];
        paciente.protocolosContratados.push({
            id: generateId(),
            protocoloId: protocolo.id,
            protocoloNome: protocolo.nome,
            valorBase,
            desconto,
            valorFinal,
            duracao: protocolo.duracao || 0,
            servicos: protocolo.servicos || {},
            observacao,
            dataVenda: new Date().toISOString()
        });

        DB.financeiro.push({
            id: generateId(),
            data: getTodayISO(),
            pacienteId: paciente.id,
            pacienteNome: paciente.nome,
            tipo: 'Venda de protocolo',
            descricao: `Venda do protocolo ${protocolo.nome}`,
            categoria: 'protocolo',
            tipoLancamento: 'receita',
            valor: valorFinal,
            status: 'pago',
            metodo: 'Protocolo',
            origem: 'Protocolo',
            observacao: observacao || `Protocolo vendido: ${protocolo.nome}`,
            parcelas: 1,
            manual: false
        });

        saveDB();

        if (USING_RESOURCE_APIS) {
            await apiUpsertResource('pacientes', paciente);
            const lastFinance = DB.financeiro[DB.financeiro.length - 1];
            if (lastFinance) await apiUpsertResource('financeiro', lastFinance);
        }

        try {
            const protocoloNome = String(protocolo?.nome || '').toLowerCase();
            const ehPlanoMensal =
                protocoloNome.includes('plano mensal') ||
                protocoloNome.includes('mensal') ||
                protocoloNome.includes('assinatura') ||
                protocoloNome.includes('clube');

            if (ehPlanoMensal) {
                await fetch('/api-clube/award_by_patient.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        patient_id: paciente.id,
                        event_type: 'plano',
                        referencia_id: protocolo.id || ''
                    })
                });
            }
        } catch (err) {
            console.error('Erro ao pontuar compra de protocolo no Clube:', err);
        }

        await registerPatientLog(
            paciente.id,
            'Protocolo vendido',
            `Protocolo ${protocolo.nome} vendido por ${formatCurrency(valorFinal)}${desconto > 0 ? ` com desconto de ${formatCurrency(desconto)}` : ''}`
        );

        closeModal('modal-venda-protocolo');
        renderPacientes();
        updateDashboard();
        renderPatientQuickReport(paciente.id);
        logAudit('Criou', 'Venda Protocolo', `${protocolo.nome} → ${paciente.nome}`);
        showToast(`Protocolo ${protocolo.nome} vendido com sucesso para ${paciente.nome}!`);
        return;
    }

    if(e.target.id === 'form-novo-protocolo') {
        const servicos = {
            'Consulta': parseInt(document.getElementById('prot-cred-consulta').value) || 0,
            'Nutricionista': parseInt(document.getElementById('prot-cred-nutri').value) || 0,
            'Exame': parseInt(document.getElementById('prot-cred-exame').value) || 0,
            'Procedimento': parseInt(document.getElementById('prot-cred-proced').value) || 0
        };

        const form = document.getElementById('form-novo-protocolo');
        const editingId = form?.dataset.editingId;
        const payload = {
            id: editingId || generateId(),
            nome: document.getElementById('prot-nome').value,
            valor: parseFloat(document.getElementById('prot-valor').value),
            duracao: parseInt(document.getElementById('prot-dias').value) || 30,
            servicos: Object.fromEntries(Object.entries(servicos).filter(([_,v]) => v > 0))
        };

        if (editingId) {
            const existing = DB.protocolos.find(p => p.id === editingId);
            if (existing) Object.assign(existing, payload);
            logAudit('Editou', 'Protocolo', payload.nome);
            showToast(`Protocolo ${payload.nome} atualizado com sucesso!`);
        } else {
            DB.protocolos.push(payload);
            logAudit('Criou', 'Protocolo', payload.nome);
            showToast(`Protocolo ${payload.nome} criado com sucesso!`);
        }

        saveDB();
        if (USING_RESOURCE_APIS) await apiUpsertResource('protocolos', payload);
        renderProtocolos();
        closeModal('modal-novo-protocolo');
    }

    if(e.target.id === 'form-financeiro') {
        const editingId = document.getElementById('fin-id').value;
        const tipoLancamento = document.getElementById('fin-tipo').value;
        const valorBase = Math.abs(parseFloat(document.getElementById('fin-valor').value) || 0);
        const payload = normalizeFinancialEntry({
            id: editingId || generateId(),
            data: document.getElementById('fin-data').value || getTodayISO(),
            descricao: document.getElementById('fin-descricao').value.trim(),
            tipo: document.getElementById('fin-descricao').value.trim(),
            categoria: document.getElementById('fin-categoria').value,
            tipoLancamento,
            valor: tipoLancamento === 'despesa' ? -valorBase : valorBase,
            status: document.getElementById('fin-status').value,
            metodo: document.getElementById('fin-metodo').value,
            origem: document.getElementById('fin-origem').value.trim() || 'Manual',
            observacao: document.getElementById('fin-observacao').value.trim(),
            pacienteId: null,
            pacienteNome: '',
            manual: true
        });

        const existingIndex = DB.financeiro.findIndex(item => item.id === editingId);
        if (existingIndex >= 0) {
            DB.financeiro[existingIndex] = payload;
            logAudit('Editou', 'Financeiro', payload?.descricao || '');
            showToast('Lançamento financeiro atualizado com sucesso!');
        } else {
            DB.financeiro.push(payload);
            logAudit('Criou', 'Financeiro', payload?.descricao || '');
            showToast('Lançamento financeiro cadastrado com sucesso!');
        }

        saveDB();
        if (USING_RESOURCE_APIS) await apiUpsertResource('financeiro', payload);
        closeModal('modal-financeiro');
        renderFinancialReport();
        renderStrategySection();
        updateDashboard();
    }
    
    if(e.target.id === 'form-estoque') {
        const item = {
            id: window.__editingAppointmentId || generateId(),
            nome: document.getElementById('est-nome').value,
            lote: document.getElementById('est-lote').value || 'N/A',
            validade: document.getElementById('est-validade').value,
            qtd: parseInt(document.getElementById('est-qtd').value),
            min: parseInt(document.getElementById('est-min').value) || 10,
            custo: parseFloat(document.getElementById('est-custo').value),
            preco: parseFloat(document.getElementById('est-preco').value),
            dataEntrada: getTodayISO()
        };
        
        DB.estoque.push(item);
        DB.financeiro.push({
            id: window.__editingAppointmentId || generateId(),
            data: item.dataEntrada,
            pacienteId: null,
            pacienteNome: 'Estoque',
            tipo: 'Compra de estoque',
            valor: -Math.abs((Number(item.qtd) || 0) * (Number(item.custo) || 0)),
            metodo: 'Custo interno',
            parcelas: 1,
            origem: 'Estoque',
            categoria: 'despesa_estoque',
            estoqueItemId: item.id,
            detalhes: { item: item.nome, lote: item.lote }
        });
        saveDB();
        if (USING_RESOURCE_APIS) {
            await apiUpsertResource('estoque', item);
            const stockExpense = DB.financeiro[DB.financeiro.length - 1];
            if (stockExpense) await apiUpsertResource('financeiro', stockExpense);
        }
        renderEstoque();
        if (document.getElementById('table-financial-body')) renderFinancialReport();
        updateDashboard();
        closeModal('modal-estoque');
        logAudit('Criou', 'Estoque', item.nome);
        showToast(`${item.nome} adicionado ao estoque`);
    }

if (e.target.id === 'form-cupom') {
        e.preventDefault();

        if (currentUserRole !== 'ADMIN') {
            showToast('Apenas administrador pode cadastrar cupons', 'error');
            return;
        }

        const editId = (document.getElementById('cupom-id') || {}).value || '';
        const payload = {
            id:             editId || generateId(),
            codigo:         document.getElementById('cupom-codigo').value.trim().toUpperCase(),
            tipo:           document.getElementById('cupom-tipo').value,
            valor:          parseFloat(document.getElementById('cupom-valor').value || 0),
            ativo:          document.getElementById('cupom-ativo').value === '1',
            validadeInicio: document.getElementById('cupom-validade-inicio')?.value || null,
            validadeFim:    document.getElementById('cupom-validade-fim')?.value    || null,
            limite:         document.getElementById('cupom-limite')?.value ? parseInt(document.getElementById('cupom-limite').value) : null,
            usos:           0
        };

        if (!payload.codigo || !payload.valor) {
            showToast('Preencha os dados do cupom', 'error');
            return;
        }

        DB.cupons = DB.cupons || [];
        if (editId) {
            const idx = DB.cupons.findIndex(x => String(x.id) === String(editId));
            if (idx >= 0) {
                payload.usos = DB.cupons[idx].usos || 0;
                DB.cupons[idx] = payload;
            } else {
                DB.cupons.push(payload);
            }
        } else {
            DB.cupons.push(payload);
        }
        saveDB();
        if (USING_RESOURCE_APIS) apiUpsertResource('cupons', payload);

        // reset modal
        const _title = document.querySelector('#modal-cupom h3');
        const _btn   = document.querySelector('#form-cupom button[type="submit"]');
        if (_title) _title.textContent = 'Cadastrar Cupom';
        if (_btn)   _btn.textContent   = 'Salvar Cupom';
        const _idField = document.getElementById('cupom-id');
        if (_idField) _idField.value = '';

        closeModal('modal-cupom');
        renderCouponsSection();
        logAudit(editId ? 'Editou' : 'Criou', 'Cupom', payload.codigo);
        showToast(editId ? `Cupom ${payload.codigo} atualizado!` : `Cupom ${payload.codigo} cadastrado!`);
    }

});

// ============================================
// HELPERS
// ============================================

function populatePatientSelect() { 
    const select = document.getElementById('ag-paciente');
    if (select) {
        select.innerHTML = '<option value="">Selecione um paciente...</option>' + 
            DB.pacientes.sort((a,b) => a.nome.localeCompare(b.nome))
                .map(p => `<option value="${p.id}">${p.nome} • ${p.cpf || ''}</option>`).join(''); 
    }
}

function deletePatient(id) {
    if (currentUserRole !== 'ADMIN') {
        showToast('Apenas administrador pode excluir pacientes', 'error');
        return;
    }

    const paciente = DB.pacientes.find(p => p.id === id);
    if (!paciente) {
        showToast('Paciente não encontrado', 'error');
        return;
    }

    const hasActiveAppointments = (DB.agendamentos || []).some(a =>
        a.pacienteId === id && a.status !== 'Finalizado' && a.status !== 'Cancelado'
    );

    if (hasActiveAppointments) {
        showToast('Este paciente possui agendamentos ativos e não pode ser excluído.', 'error');
        return;
    }

    if (!confirm(`Deseja excluir o paciente "${paciente.nome}"?`)) {
        return;
    }

    DB.pacientes = DB.pacientes.filter(p => p.id !== id);
    saveDB();

    if (typeof USING_RESOURCE_APIS !== 'undefined' && USING_RESOURCE_APIS) {
        apiDeleteResource('pacientes', id).catch(console.error);
    }

    renderPacientes();
    updateDashboard();
    logAudit('Deletou', 'Paciente', paciente.nome);
    showToast(`Paciente "${paciente.nome}" excluído com sucesso!`);
}

function editPatient(id) { 
    const paciente = DB.pacientes.find(p => p.id === id);
    if (!paciente) return;

    openModal('modal-paciente');
    document.getElementById('pac-id').value = paciente.id;
    document.getElementById('pac-nome').value = paciente.nome || '';
    document.getElementById('pac-cpf').value = paciente.cpf || '';
    document.getElementById('pac-nasc').value = paciente.dataNascimento || '';
    document.getElementById('pac-endereco').value = paciente.endereco || '';
    document.getElementById('pac-tipo').value = paciente.tipoAtendimento || '';
    document.getElementById('pac-tel').value = paciente.tel || '';
    document.getElementById('pac-email').value = paciente.email || '';
    document.getElementById('pac-observacoes').value = paciente.observacoes || '';
    document.getElementById('pac-flag-alergia').checked = !!paciente.flags?.alergia;
    document.getElementById('pac-flag-atencao').checked = !!paciente.flags?.atencao;
    document.getElementById('pac-flag-restricao').checked = !!paciente.flags?.restricao;
    document.getElementById('pac-flag-ansioso').checked = !!paciente.flags?.ansioso;
    document.getElementById('pac-lgpd').checked = !!paciente.lgpdConsent;

    const title = document.getElementById('modal-paciente-title');
    const submitBtn = document.querySelector('#form-paciente button[type="submit"]');
    if (title) title.innerText = `Editar Paciente`;
    if (submitBtn) submitBtn.innerText = 'Salvar Alterações';
    renderPatientLogs(paciente.id);
}

function deleteProtocol(id) {
    const protocolo = (DB.protocolos || []).find(p => String(p.id) === String(id));
    if (!protocolo) {
        showToast('Protocolo não encontrado', 'error');
        return;
    }

    if (!confirm(`Deseja excluir o protocolo "${protocolo.nome}"?`)) {
        return;
    }

    DB.protocolos = (DB.protocolos || []).filter(p => String(p.id) !== String(id));
    saveDB();

    if (USING_RESOURCE_APIS) {
        apiDeleteResource('protocolos', id).catch(console.error);
    }

    renderProtocolos();
    logAudit('Deletou', 'Protocolo', protocolo.nome);
    showToast(`Protocolo "${protocolo.nome}" excluído com sucesso!`);
}

function editProtocol(id) {
    const protocolo = DB.protocolos.find(p => p.id === id);
    if (!protocolo) return;

    openModal('modal-novo-protocolo');
    document.getElementById('form-novo-protocolo').dataset.editingId = protocolo.id;
    document.getElementById('prot-nome').value = protocolo.nome || '';
    document.getElementById('prot-valor').value = Number(protocolo.valor || 0);
    document.getElementById('prot-dias').value = Number(protocolo.duracao || 30);
    document.getElementById('prot-cred-consulta').value = Number(protocolo.servicos?.Consulta || 0);
    document.getElementById('prot-cred-nutri').value = Number(protocolo.servicos?.Nutricionista || 0);
    document.getElementById('prot-cred-exame').value = Number(protocolo.servicos?.Exame || 0);
    document.getElementById('prot-cred-proced').value = Number(protocolo.servicos?.Procedimento || 0);

    const title = document.querySelector('#modal-novo-protocolo h3');
    const submitBtn = document.querySelector('#form-novo-protocolo button[type="submit"]');
    if (title) title.innerText = 'Editar Protocolo';
    if (submitBtn) submitBtn.innerText = 'Salvar Alterações';
}

// ============================================
// ANAMNESE
// ============================================

function renderQuestionnaire() {
    const container = document.getElementById('questions-container'); 
    if(!container) return;
    container.innerHTML = '';
    
    let pacienteId = null;
    if (currentConsultationId) { 
        const ap = DB.agendamentos.find(a => a.id === currentConsultationId); 
        pacienteId = ap?.pacienteId; 
    }
    if (!pacienteId && currentQuickPatientId) pacienteId = currentQuickPatientId;

    const last = (DB.avaliacoes||[])
        .filter(a => a.pacienteId === pacienteId)
        .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    STANDARD_QUESTIONS.forEach((q, idx) => {
        const id = 'q_' + idx;
        const prev = last && last.perguntas && last.perguntas[id] ? last.perguntas[id] : {};
        
        const block = document.createElement('div'); 
        block.className = 'p-5 bg-[#FCF7F9] rounded-2xl border border-[#CBE5F7] border-opacity-30';
        block.innerHTML = `
            <div class="font-heading font-bold text-[#6F4B36] mb-3">${idx + 1}. ${q}</div>
            <div class="grid grid-cols-2 gap-4 mb-3">
                <div>
                    <label class="text-xs text-gray-500 block mb-1">Antes (0-10)</label>
                    <input type="number" min="0" max="10" id="${id}_antes" 
                           value="${prev.antes || ''}" 
                           class="w-full text-center bg-white rounded-xl border-[#CBE5F7]">
                </div>
                <div>
                    <label class="text-xs text-gray-500 block mb-1">Depois (0-10)</label>
                    <input type="number" min="0" max="10" id="${id}_depois" 
                           value="${prev.depois || ''}" 
                           class="w-full text-center bg-white rounded-xl border-[#CBE5F7]">
                </div>
            </div>
            <textarea id="${id}_resp" rows="2" 
                      class="w-full bg-white rounded-xl border-[#CBE5F7]" 
                      placeholder="Observações...">${prev.resposta || ''}</textarea>
        `;
        container.appendChild(block);
    });
    
    const notes = document.createElement('div'); 
    notes.className = 'mt-6 p-5 bg-[#FCF7F9] rounded-2xl border border-[#CBE5F7] border-opacity-30';
    notes.innerHTML = `
        <label class="font-heading font-bold text-[#6F4B36] block mb-2">Observações Gerais</label>
        <textarea id="anamnese-notes" class="w-full bg-white rounded-xl border-[#CBE5F7]" rows="3">${last && last.notes ? last.notes : ''}</textarea>
    `;
    container.appendChild(notes);
}

function saveAnamnese() {
    try {
        let pacienteId = null;
        if (currentConsultationId) { 
            const ap = DB.agendamentos.find(a => a.id === currentConsultationId); 
            pacienteId = ap?.pacienteId; 
        }
        if (!pacienteId && currentQuickPatientId) pacienteId = currentQuickPatientId;
        
        if(!pacienteId) { 
            showToast('Nenhum paciente selecionado', 'error'); 
            return; 
        }
        
        const perguntas = {};
        STANDARD_QUESTIONS.forEach((q, idx) => {
            const id = 'q_' + idx;
            const antes = document.getElementById(id + '_antes')?.value || '';
            const depois = document.getElementById(id + '_depois')?.value || '';
            const resposta = document.getElementById(id + '_resp')?.value || '';
            perguntas[id] = { 
                pergunta: q, 
                antes: antes, 
                depois: depois, 
                resposta 
            };
        });
        
        const rec = { 
            id: window.__editingAppointmentId || generateId(), 
            pacienteId, 
            timestamp: new Date().toISOString(), 
            perguntas, 
            notes: document.getElementById('anamnese-notes')?.value || '' 
        };
        
        DB.avaliacoes = DB.avaliacoes || [];
        DB.avaliacoes.unshift(rec);
        tempAnamnese = rec;
        saveDB();
        if (USING_RESOURCE_APIS) await apiUpsertResource('avaliacoes', rec); 
        closeModal('modal-questionnaire'); 
        logAudit('Editou', 'Anamnese', DB.currentPatient?.nome || '');
        showToast('Anamnese salva com sucesso');
        renderAtendimentoScreen();
    } catch (err) { 
        console.error('saveAnamnese', err); 
        showToast('Erro ao salvar anamnese', 'error'); 
    }
}

window.openQuestionnaire = () => { 
    renderQuestionnaire(); 
    openModal('modal-questionnaire'); 
};

window.saveAnamnese = saveAnamnese;

function openAnamneseHistory(pacienteId) {
    const list = document.getElementById('anamnese-history-list'); 
    const detail = document.getElementById('anamnese-detail');
    if(!list) return; 
    
    list.innerHTML = ''; 
    detail.innerHTML = '';
    
    const items = (DB.avaliacoes||[])
        .filter(a => a.pacienteId === pacienteId)
        .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if(items.length === 0) { 
        list.innerHTML = '<div class="text-center py-8 text-gray-400 bg-[#FCF7F9] rounded-2xl">Nenhum registro de anamnese encontrado.</div>'; 
    } else {
        items.forEach(it => {
            const d = new Date(it.timestamp).toLocaleString();
            const el = document.createElement('div'); 
            el.className = 'p-4 bg-[#FCF7F9] rounded-2xl border border-[#CBE5F7] flex justify-between items-center';
            el.innerHTML = `
                <div>
                    <div class="font-medium text-gray-800">${d}</div>
                    <div class="text-xs text-gray-500 mt-1">${(it.notes || '').slice(0, 120)}${(it.notes || '').length > 120 ? '...' : ''}</div>
                </div>
                <div>
                    <button class="btn-secondary text-xs !py-2 !px-4" onclick="viewAnamneseDetail('${it.id}')">
                        <i class="fa-solid fa-eye mr-1"></i>Ver
                    </button>
                </div>
            `;
            list.appendChild(el);
        });
    }
    
    const atendList = DB.atendimentos
        .filter(a => a.pacienteId === pacienteId)
        .sort((a,b) => new Date(b.data) - new Date(a.data))
        .slice(0, 5);
    
    if(atendList.length > 0) {
        const h = document.createElement('div'); 
        h.className = 'mt-6';
        h.innerHTML = `
            <div class="font-heading font-bold text-[#6F4B36] mb-3">Atendimentos Recentes</div>
            <div class="space-y-2">
                ${atendList.map(at => `
                    <div class="bg-white p-3 rounded-xl border border-[#CBE5F7] text-sm">
                        <span class="font-medium text-gray-800">${formatDate(at.data)}</span>
                        <span class="text-gray-500 ml-2">• ${at.id.slice(0,8)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        list.appendChild(h);
    }
    
    openModal('modal-anamnese-history');
}

function viewAnamneseDetail(id) {
    const rec = (DB.avaliacoes||[]).find(a => a.id === id); 
    const detail = document.getElementById('anamnese-detail'); 
    if(!rec || !detail) return;
    
    let html = `
        <div class="bg-white p-4 rounded-xl border border-[#CBE5F7] mb-4">
            <div class="font-bold text-[#6F4B36] mb-1">Data do Registro</div>
            <div class="text-gray-800">${new Date(rec.timestamp).toLocaleString()}</div>
        </div>
    `;
    
    if (rec.notes) {
        html += `
            <div class="bg-white p-4 rounded-xl border border-[#CBE5F7] mb-4">
                <div class="font-bold text-[#6F4B36] mb-1">Observações Gerais</div>
                <div class="text-gray-700">${rec.notes}</div>
            </div>
        `;
    }
    
    html += '<div class="space-y-3">';
    
    if (rec.perguntas) {
        Object.keys(rec.perguntas).forEach(k => {
            const q = rec.perguntas[k]; 
            html += `
                <div class="bg-white p-4 rounded-xl border border-[#CBE5F7]">
                    <div class="font-medium text-[#6F4B36] text-sm mb-2">${q.pergunta || 'Pergunta'}</div>
                    <div class="grid grid-cols-2 gap-4 mb-2 text-xs">
                        <div class="bg-[#FCF7F9] p-2 rounded-lg">
                            <span class="text-gray-500">Antes:</span> 
                            <span class="font-bold text-[#6F4B36]">${q.antes || '—'}</span>
                        </div>
                        <div class="bg-[#FCF7F9] p-2 rounded-lg">
                            <span class="text-gray-500">Depois:</span> 
                            <span class="font-bold text-[#6F4B36]">${q.depois || '—'}</span>
                        </div>
                    </div>
                    <div class="text-sm text-gray-700 bg-[#FCF7F9] p-3 rounded-lg">
                        ${q.resposta || 'Sem observações'}
                    </div>
                </div>
            `;
        });
    }
    
    html += '</div>';
    detail.innerHTML = html;
}

window.openPatientReport = (id) => { 
    const p = DB.pacientes.find(x => x.id === id); 
    if (p) {
        document.getElementById('rep-nome').innerText = p.nome; 
        document.getElementById('rep-cpf').innerText = p.cpf || '';
        document.getElementById('rep-tel').innerText = p.tel || '';
        document.getElementById('rep-generated-date').innerText = new Date().toLocaleString();
        
        // Calcular total investido
        const financeiroPaciente = DB.financeiro.filter(f => f.pacienteId === id);
        const totalInvestido = financeiroPaciente.reduce((sum, f) => sum + f.valor, 0);
        document.getElementById('rep-total-invested').innerHTML = formatCurrency(totalInvestido);
        
        // Timeline de atendimentos
        const atendimentos = DB.atendimentos
            .filter(a => a.pacienteId === id)
            .sort((a,b) => new Date(b.data) - new Date(a.data));
        
        const timeline = document.getElementById('timeline-container');
        if (timeline) {
            timeline.innerHTML = '<div class="timeline-line"></div>';
            
            if (atendimentos.length > 0) {
                atendimentos.slice(0, 10).forEach((at, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === atendimentos.length - 1;
                    
                    const eventDiv = document.createElement('div');
                    eventDiv.className = `relative pl-6 ${isLast ? '' : 'pb-6'}`;
                    eventDiv.innerHTML = `
                        <div class="absolute left-0 top-1 w-4 h-4 bg-white border-3 border-[#6F4B36] rounded-full z-10"></div>
                        <div class="bg-[#FCF7F9] p-4 rounded-xl border border-[#CBE5F7]">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="font-bold text-[#6F4B36]">${formatDate(at.data)}</span>
                                    <span class="text-xs text-gray-500 ml-2">${at.id.slice(0,8)}</span>
                                </div>
                                <span class="badge badge-secondary">Atendimento</span>
                            </div>
                            <div class="mt-2 text-sm text-gray-700">
                                ${at.anamnese ? '<span class="font-medium">Queixa:</span> ' + (at.anamnese.note || at.anamnese['5'] || 'Não registrada') : 'Sem dados'}
                            </div>
                        </div>
                    `;
                    timeline.appendChild(eventDiv);
                });
            } else {
                timeline.innerHTML = '<div class="text-center py-8 text-gray-400">Nenhum atendimento registrado</div>';
            }
        }
        
        // Financeiro
        const repFinanceiro = document.getElementById('rep-financeiro-body');
        if (repFinanceiro) {
            repFinanceiro.innerHTML = financeiroPaciente
                .sort((a,b) => new Date(b.data) - new Date(a.data))
                .map(f => `
                    <tr>
                        <td class="p-2 border border-[#CBE5F7]">${formatDate(f.data.split('T')[0])}</td>
                        <td class="p-2 border border-[#CBE5F7]">${f.tipo}</td>
                        <td class="p-2 border border-[#CBE5F7] text-right font-mono">${formatCurrency(f.valor)}</td>
                        <td class="p-2 border border-[#CBE5F7]">${f.metodo || '—'}</td>
                    </tr>
                `).join('');
        }
        
        openModal('modal-relatorio-geral'); 
    }
};

window.renderPatientQuickReport = (id) => { 
    const p = DB.pacientes.find(x => x.id === id); 
    if (p) {
        document.getElementById('quick-name').innerText = p.nome; 
        document.getElementById('quick-cpf').innerText = p.cpf || '';
        document.getElementById('quick-tel').innerText = p.tel || '—';
        document.getElementById('quick-type-badge').innerHTML = `<span class="badge ${p.tipoAtendimento === 'Particular' ? 'badge-primary' : 'badge-secondary'}">${p.tipoAtendimento}</span>`;
        
        // Última visita
        const lastAtendimento = DB.atendimentos
            .filter(a => a.pacienteId === id)
            .sort((a,b) => new Date(b.data) - new Date(a.data))[0];
        
        document.getElementById('quick-last-visit').innerText = lastAtendimento ? formatDate(lastAtendimento.data) : 'Nunca';
        
        // Última anamnese
        const lastAnamnese = (DB.avaliacoes||[])
            .filter(a => a.pacienteId === id)
            .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        document.getElementById('quick-last-anamnese').innerText = lastAnamnese?.notes?.slice(0, 80) + '...' || 'Nenhum registro';
        
        // Total investido
        const totalSpent = DB.financeiro
            .filter(f => f.pacienteId === id)
            .reduce((sum, f) => sum + f.valor, 0);
        
        document.getElementById('quick-total-spent').innerText = formatCurrency(totalSpent);
        
        // Alertas
        const alertsDiv = document.getElementById('quick-alerts');
        const hasPending = DB.agendamentos.some(a => a.pacienteId === id && a.status !== 'Finalizado');
        alertsDiv.innerHTML = hasPending ? '<span class="badge badge-primary"><i class="fa-regular fa-clock mr-1"></i>Agendamento pendente</span>' : '';
        
        const obsEl = document.getElementById('quick-patient-observacoes');
        if (obsEl) {
            const flags = [];
            if (p.flags?.alergia) flags.push('Possui alergia');
            if (p.flags?.atencao) flags.push('Requer atenção especial');
            if (p.flags?.restricao) flags.push('Restrição medicamentosa');
            if (p.flags?.ansioso) flags.push('Sensível/ansioso em procedimento');

            const obs = (p.observacoes || '').trim();
            const parts = [];

            if (flags.length) parts.push('⚠️ ' + flags.join(' • '));
            if (obs) parts.push(obs);

            obsEl.innerText = parts.length ? parts.join('\n\n') : 'Nenhuma observação cadastrada.';
        }

        currentQuickPatientId = id;
        document.getElementById('patient-quick-panel').classList.remove('hidden');
    }
};

window.openFullReportFromQuick = () => {
    if (currentQuickPatientId) {
        openPatientReport(currentQuickPatientId);
    }
};

window.openSellProtocolModal = () => {
    if (!currentQuickPatientId) {
        showToast('Paciente não selecionado', 'error');
        return;
    }

    const paciente = DB.pacientes.find(p => p.id === currentQuickPatientId);
    if (!paciente) {
        showToast('Paciente não encontrado', 'error');
        return;
    }

    const select = document.getElementById('sell-prot-select');
    const pacienteField = document.getElementById('sell-prot-paciente');
    const descontoField = document.getElementById('sell-prot-desconto');
    const obsField = document.getElementById('sell-prot-obs');

    if (!select || !pacienteField) {
        showToast('Modal de venda de protocolo não encontrado', 'error');
        return;
    }

    if (!DB.protocolos || DB.protocolos.length === 0) {
        showToast('Cadastre ao menos um protocolo antes de vender', 'error');
        return;
    }

    pacienteField.value = paciente.nome;
    if (descontoField) descontoField.value = '0';
    if (obsField) obsField.value = '';

    select.innerHTML = '<option value="">Selecione um protocolo...</option>' +
        DB.protocolos
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
            .map(prot => `<option value="${prot.id}">${prot.nome} • ${formatCurrency(prot.valor || 0)}</option>`)
            .join('');

    document.getElementById('sell-prot-valor-base').value = 'R$ 0,00';
    document.getElementById('sell-prot-total').innerText = 'R$ 0,00';

    openModal('modal-venda-protocolo');
};

function renderEstoque() {
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const q = (document.getElementById('search-estoque')?.value || '').toLowerCase();

    const itens = (DB.estoque || []).filter(e =>
        !q || e.nome?.toLowerCase().includes(q) || e.lote?.toLowerCase().includes(q)
    );

    // ── Computar alertas ────────────────────────────────────────
    const vencidos   = itens.filter(e => new Date(e.validade) < hoje);
    const vencendo   = itens.filter(e => {
        const d = Math.floor((new Date(e.validade) - hoje) / 86400000);
        return d >= 0 && d <= 60;
    });
    const totalQtd   = itens.reduce((s, e) => s + (e.qtd || 0), 0);
    const totalValor = itens.reduce((s, e) => s + ((e.preco || 0) * (e.qtd || 0)), 0);

    const alertsEl = document.getElementById('estoque-alerts');
    if (alertsEl) {
        alertsEl.innerHTML = `
        <div class="border border-red-200 rounded-lg p-4 flex items-start gap-3" style="background:#fef2f2;">
            <i class="fa-solid fa-circle-exclamation text-red-600 mt-0.5"></i>
            <div>
                <p class="font-medium text-red-900 text-sm">${vencidos.length} item(ns) vencido(s)</p>
                <p class="text-xs text-red-700">Requer atenção imediata</p>
            </div>
        </div>
        <div class="border border-yellow-200 rounded-lg p-4 flex items-start gap-3" style="background:#fefce8;">
            <i class="fa-solid fa-circle-exclamation text-yellow-600 mt-0.5"></i>
            <div>
                <p class="font-medium text-yellow-900 text-sm">${vencendo.length} item(ns) vencendo</p>
                <p class="text-xs text-yellow-700">Vence em menos de 60 dias</p>
            </div>
        </div>
        <div class="border border-blue-200 rounded-lg p-4 flex items-start gap-3" style="background:#eff6ff;">
            <i class="fa-solid fa-boxes-stacked text-blue-600 mt-0.5"></i>
            <div>
                <p class="font-medium text-blue-900 text-sm">${totalQtd} itens em estoque</p>
                <p class="text-xs text-blue-700">Valor total: ${formatCurrency(totalValor)}</p>
            </div>
        </div>`;
    }

    // ── Tabela ──────────────────────────────────────────────────
    const getStatus = (e) => {
        const validade = new Date(e.validade);
        const dias = Math.floor((validade - hoje) / 86400000);
        if (validade < hoje)        return { label: 'Vencido',  cls: 'background:#fee2e2;color:#b91c1c;' };
        if (dias <= 60)             return { label: 'Vencendo', cls: 'background:#fef9c3;color:#a16207;' };
        if ((e.qtd || 0) <= (e.min || 0)) return { label: 'Estoque Baixo', cls: 'background:#dbeafe;color:#1d4ed8;' };
        return { label: 'Normal', cls: 'background:#dcfce7;color:#15803d;' };
    };

    document.getElementById('table-estoque-body').innerHTML = itens.length === 0
        ? `<tr><td colspan="8" class="px-6 py-10 text-center text-sm text-gray-400">Nenhum item encontrado.</td></tr>`
        : itens.map(e => {
            const st = getStatus(e);
            return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 font-medium text-sm" style="color:#262261;">${e.nome}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${e.lote || '—'}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${e.qtd ?? 0} un</td>
                <td class="px-6 py-4 text-sm text-gray-600">${formatDate(e.validade)}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${formatCurrency(e.custo)}</td>
                <td class="px-6 py-4 text-sm font-medium" style="color:#262261;">${formatCurrency(e.preco)}</td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium" style="${st.cls}">${st.label}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex gap-1">
                        <button onclick="editEstoque('${e.id}')" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Editar">
                            <i class="fa-solid fa-pen text-gray-400 text-xs"></i>
                        </button>
                        <button onclick="deleteEstoque('${e.id}')" class="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                            <i class="fa-solid fa-trash text-red-400 text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
}


function editEstoque(id) {
    const e = DB.estoque.find(x => x.id === id);
    if (!e) return;
    window.__editingAppointmentId = e.id;
    document.getElementById('est-nome').value    = e.nome    || '';
    document.getElementById('est-lote').value    = e.lote    || '';
    document.getElementById('est-validade').value= e.validade|| '';
    document.getElementById('est-qtd').value     = e.qtd     || 0;
    document.getElementById('est-min').value     = e.min     || 10;
    document.getElementById('est-custo').value   = e.custo   || 0;
    document.getElementById('est-preco').value   = e.preco   || 0;
    openModal('modal-estoque');
}

function deleteEstoque(id) {
    if (!confirm('Remover este item do estoque?')) return;
    DB.estoque = DB.estoque.filter(x => x.id !== id);
    saveDB();
    renderEstoque();
    logAudit('Deletou', 'Estoque', '');
    showToast('Item removido do estoque.');
}

function ensureFinancialFilters() {
    const modeSelect = document.getElementById('financial-filter-mode');
    const monthSelect = document.getElementById('financial-filter-month');
    const yearSelect = document.getElementById('financial-filter-year');
    const typeSelect = document.getElementById('financial-filter-type');
    const categorySelect = document.getElementById('financial-filter-category');
    const statusSelect = document.getElementById('financial-filter-status');
    if (!modeSelect || modeSelect.dataset.bound === 'true') return;

    modeSelect.dataset.bound = 'true';
    modeSelect.addEventListener('change', (e) => {
        financialFilterMode = e.target.value;
        toggleFinancialMonthFilter();
        renderFinancialReport();
    });
    monthSelect?.addEventListener('change', (e) => {
        financialFilterMonth = Number(e.target.value);
        renderFinancialReport();
    });
    yearSelect?.addEventListener('change', (e) => {
        financialFilterYear = Number(e.target.value);
        renderFinancialReport();
    });
    typeSelect?.addEventListener('change', (e) => {
        financialFilterType = e.target.value;
        renderFinancialReport();
    });
    categorySelect?.addEventListener('change', (e) => {
        financialFilterCategory = e.target.value;
        renderFinancialReport();
    });
    statusSelect?.addEventListener('change', (e) => {
        financialFilterStatus = e.target.value;
        renderFinancialReport();
    });
}

function populateFinancialYearOptions(entries) {
    const yearSelect = document.getElementById('financial-filter-year');
    if (!yearSelect) return;
    const years = [...new Set(entries.map(entry => getYearFromDate(entry.data)).filter(Boolean))].sort((a, b) => b - a);
    const currentYear = new Date().getFullYear();
    if (!years.includes(currentYear)) years.unshift(currentYear);
    yearSelect.innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join('');
    if (!years.includes(financialFilterYear)) financialFilterYear = years[0] || currentYear;
    yearSelect.value = String(financialFilterYear);
}

function populateFinancialCategoryOptions(entries) {
    const categorySelect = document.getElementById('financial-filter-category');
    if (!categorySelect) return;
    const categories = [...new Set(entries.map(entry => entry.categoria).filter(Boolean))].sort((a, b) => getFinancialCategoryLabel(a).localeCompare(getFinancialCategoryLabel(b)));
    categorySelect.innerHTML = '<option value="all">Todas</option>' + categories.map(category => `<option value="${category}">${getFinancialCategoryLabel(category)}</option>`).join('');
    categorySelect.value = categories.includes(financialFilterCategory) ? financialFilterCategory : 'all';
}

function toggleFinancialMonthFilter() {
    const wrap = document.getElementById('financial-filter-month-wrap');
    const modeSelect = document.getElementById('financial-filter-mode');
    const monthSelect = document.getElementById('financial-filter-month');
    const typeSelect = document.getElementById('financial-filter-type');
    const categorySelect = document.getElementById('financial-filter-category');
    const statusSelect = document.getElementById('financial-filter-status');
    if (modeSelect) modeSelect.value = financialFilterMode;
    if (monthSelect) monthSelect.value = String(financialFilterMonth);
    if (typeSelect) typeSelect.value = financialFilterType;
    if (categorySelect) categorySelect.value = financialFilterCategory;
    if (statusSelect) statusSelect.value = financialFilterStatus;
    if (wrap) wrap.style.display = financialFilterMode === 'month' ? 'block' : 'none';
}

function getFilteredFinancialEntries(entries = buildFinancialEntries()) {
    return entries.filter(entry => {
        const year = getYearFromDate(entry.data);
        if (year !== financialFilterYear) return false;
        if (financialFilterMode === 'month' && getMonthFromDate(entry.data) !== financialFilterMonth) return false;
        if (financialFilterType !== 'all' && getFinancialEntryType(entry) !== financialFilterType) return false;
        if (financialFilterCategory !== 'all' && entry.categoria !== financialFilterCategory) return false;
        if (financialFilterStatus !== 'all' && (entry.status || 'pago') !== financialFilterStatus) return false;
        return true;
    });
}

function canEditFinancialEntry(entry) {
    return !!entry.manual && !entry.estoqueItemId && !String(entry.id || '').startsWith('stock_');
}

window.openFinancialModal = (id = null) => {
    if (!id) {
        openModal('modal-financeiro');
        return;
    }

    const entry = buildFinancialEntries().find(item => item.id === id);
    if (!entry) return;
    if (!canEditFinancialEntry(entry)) {
        showToast('Este lançamento é automático e não pode ser editado por aqui.', 'error');
        return;
    }

    openModal('modal-financeiro');
    document.getElementById('fin-id').value = entry.id;
    document.getElementById('fin-data').value = (entry.data || '').split('T')[0] || getTodayISO();
    document.getElementById('fin-tipo').value = entry.tipoLancamento || getFinancialEntryType(entry);
    document.getElementById('fin-descricao').value = entry.descricao || entry.tipo || '';
    document.getElementById('fin-categoria').value = entry.categoria || 'outros';
    document.getElementById('fin-valor').value = Math.abs(Number(entry.valor || 0));
    document.getElementById('fin-status').value = entry.status || 'pago';
    document.getElementById('fin-metodo').value = entry.metodo || 'PIX';
    document.getElementById('fin-origem').value = entry.origem || 'Manual';
    document.getElementById('fin-observacao').value = entry.observacao || '';

    const title = document.getElementById('modal-financeiro-title');
    const submitBtn = document.querySelector('#form-financeiro button[type="submit"]');
    if (title) title.innerText = 'Editar Lançamento';
    if (submitBtn) submitBtn.innerText = 'Salvar alterações';
};

window.deleteFinancialEntry = async (id) => {
    const entry = buildFinancialEntries().find(item => item.id === id);
    if (!entry) return;
    if (!canEditFinancialEntry(entry)) {
        showToast('Este lançamento é automático e não pode ser removido por aqui.', 'error');
        return;
    }
    DB.financeiro = (DB.financeiro || []).filter(item => item.id !== id);
    saveDB();
    if (USING_RESOURCE_APIS) await apiDeleteResource('financeiro', id);
    renderFinancialReport();
    renderStrategySection();
    updateDashboard();
    logAudit('Deletou', 'Financeiro', '');
    showToast('Lançamento removido com sucesso!');
};

function renderFinancialReport() {
    ensureFinancialFilters();
    const entries = buildFinancialEntries();
    populateFinancialYearOptions(entries);
    populateFinancialCategoryOptions(entries);
    toggleFinancialMonthFilter();

    const filteredEntries = getFilteredFinancialEntries(entries);
    const tbody = document.getElementById('table-financial-body');
    if (!tbody) return;

    tbody.innerHTML = filteredEntries.length
        ? filteredEntries.map(f => {
            const entryType = getFinancialEntryType(f);
            const isExpense = entryType === 'despesa';
            const valueClass = isExpense ? 'text-red-600' : 'text-[#6F4B36]';
            const statusBadgeClass = getFinancialStatusBadgeClass(f.status || 'pago');
            const actionButtons = canEditFinancialEntry(f)
                ? `
                    <button class="transition-colors mx-1" style="color:#262261;" onmouseover="this.style.color='#00d4b8'" onmouseout="this.style.color='#262261'" onclick="openFinancialModal('${f.id}')" title="Editar lançamento">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="text-red-400 hover:text-red-600 transition-colors mx-1" onclick="deleteFinancialEntry('${f.id}')" title="Excluir lançamento">
                        <i class="fa-solid fa-trash"></i>
                    </button>`
                : '<span class="text-gray-400">—</span>';
            const tipoStyle = isExpense
                ? 'background:rgba(239,68,68,0.1);color:#dc2626;'
                : 'background:rgba(34,197,94,0.1);color:#16a34a;';
            const statusStyle = (f.status || 'pago') === 'pago'
                ? 'background:#00d4b8;color:#262261;'
                : (f.status === 'vencido'
                    ? 'background:rgba(239,68,68,0.1);color:#dc2626;'
                    : 'background:rgba(234,179,8,0.15);color:#a16207;');
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 text-gray-600">${formatDate((f.data || '').split('T')[0])}</td>
                    <td class="px-6 py-4">
                        <div class="font-medium" style="color:#262261;">${f.descricao || f.tipo || '—'}</div>
                        <div class="text-xs text-gray-500">${f.observacao || f.pacienteNome || ''}</div>
                    </td>
                    <td class="px-6 py-4"><span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium" style="${tipoStyle}">${getFinancialTypeLabel(entryType)}</span></td>
                    <td class="px-6 py-4 text-gray-600">${getFinancialCategoryLabel(f.categoria)}</td>
                    <td class="px-6 py-4 font-medium" style="color:#262261;">${formatCurrency(Math.abs(Number(f.valor || 0)))}</td>
                    <td class="px-6 py-4"><span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium" style="${statusStyle}">${getFinancialStatusLabel(f.status)}</span></td>
                    <td class="px-6 py-4 text-center no-print">${actionButtons}</td>
                </tr>`;
        }).join('')
        : `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">Nenhum lançamento encontrado para o período selecionado.</td></tr>`;

    const receitas = filteredEntries.filter(f => Number(f.valor || 0) > 0).reduce((s,f) => s + Number(f.valor || 0), 0);
    const despesas = filteredEntries.filter(f => Number(f.valor || 0) < 0).reduce((s,f) => s + Math.abs(Number(f.valor || 0)), 0);
    const saldo = receitas - despesas;
    const pendencias = filteredEntries.filter(f => (f.status || 'pago') !== 'pago').reduce((s,f) => s + Math.abs(Number(f.valor || 0)), 0);

    const saldoEl = document.getElementById('financial-total-sum');
    const saldoTableEl = document.getElementById('financial-table-total-sum');
    const receitasEl = document.getElementById('financial-total-receitas');
    const despesasEl = document.getElementById('financial-total-despesas');
    const pendenciasEl = document.getElementById('financial-total-pendencias');
    if (saldoEl) {
        saldoEl.innerText = formatCurrency(saldo);
        saldoEl.classList.toggle('text-red-600', saldo < 0);
        saldoEl.classList.toggle('text-emerald-600', saldo >= 0);
    }
    if (saldoTableEl) saldoTableEl.innerText = formatCurrency(saldo);
    if (receitasEl) receitasEl.innerText = formatCurrency(receitas);
    if (despesasEl) despesasEl.innerText = formatCurrency(despesas);
    if (pendenciasEl) pendenciasEl.innerText = formatCurrency(pendencias);
}

function gerarRelatorioPersonalizado() {
    const tipo = document.getElementById('relatorio-tipo')?.value;
    const inicio = document.getElementById('relatorio-data-inicio')?.value;
    const fim = document.getElementById('relatorio-data-fim')?.value;
    if (!tipo) { showToast('Selecione o tipo de relatório', 'error'); return; }
    if (tipo === 'financeiro') { exportConsolidatedPDF(); }
    else if (tipo === 'pacientes') { exportConsolidatedExcel(); }
    else if (tipo === 'agendamentos') { showSection('agenda'); }
    else if (tipo === 'estoque') { showSection('estoque'); }
    else { showToast('Tipo de relatório não disponível', 'error'); }
}

function renderRelatorios() {
    document.getElementById('table-relatorios-body').innerHTML = DB.pacientes.map(p => {
        const atendimentos = DB.atendimentos.filter(a => a.pacienteId === p.id).length;
        const totalInvestido = DB.financeiro.filter(f => f.pacienteId === p.id).reduce((s,f) => s + f.valor, 0);
        const ultimaVisita = DB.atendimentos
            .filter(a => a.pacienteId === p.id)
            .sort((a,b) => new Date(b.data) - new Date(a.data))[0];
        
        return `<tr class="hover:bg-[#FCF7F9]">
            <td class="p-3 font-medium text-gray-800">${p.nome}</td>
            <td class="p-3 text-gray-600">${p.cpf || '—'}</td>
            <td class="p-3 text-center"><span class="badge badge-secondary">${atendimentos}</span></td>
            <td class="p-3 text-right font-mono text-[#6F4B36] font-bold">${formatCurrency(totalInvestido)}</td>
            <td class="p-3 text-center text-gray-600">${ultimaVisita ? formatDate(ultimaVisita.data) : '—'}</td>
            <td class="p-3 text-center">
                <button onclick="openPatientReport('${p.id}')" class="text-[#00d4b8] hover:text-[#00c4a9] transition-colors mx-1" title="Prontuário">
                    <i class="fa-solid fa-file-medical"></i>
                </button>
            </td>
        </tr>`;
    }).join(''); 
}

function renderAuditoria() {
    const tbody = document.getElementById('table-auditoria-body');
    if (!tbody) return;

    const filtroUsuario = (document.getElementById('auditoria-filtro-usuario')?.value || '').toLowerCase();
    const filtroAcao = (document.getElementById('auditoria-filtro-acao')?.value || '').toLowerCase();
    const filtroInicio = document.getElementById('auditoria-filtro-inicio')?.value;
    const filtroFim = document.getElementById('auditoria-filtro-fim')?.value;

    // Popula select de usuários
    const selUsuario = document.getElementById('auditoria-filtro-usuario');
    if (selUsuario && selUsuario.options.length <= 1) {
        const usuarios = [...new Set(DB.auditoria.map(a => a.usuario).filter(Boolean))];
        usuarios.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.toLowerCase(); opt.textContent = u;
            selUsuario.appendChild(opt);
        });
    }

    const getAcaoStyle = (acao = '') => {
        const a = acao.toLowerCase();
        if (a.includes('cri') || a.includes('add') || a.includes('nov')) return 'background:rgba(34,197,94,0.1);color:#16a34a;';
        if (a.includes('edit') || a.includes('atualiz') || a.includes('alter')) return 'background:rgba(59,130,246,0.1);color:#2563eb;';
        if (a.includes('exclu') || a.includes('delet') || a.includes('remov')) return 'background:rgba(239,68,68,0.1);color:#dc2626;';
        return 'background:#f3f4f6;color:#374151;';
    };

    const getAcaoIcon = (acao = '') => {
        const a = acao.toLowerCase();
        if (a.includes('cri') || a.includes('add') || a.includes('nov')) return 'fa-plus';
        if (a.includes('edit') || a.includes('atualiz') || a.includes('alter')) return 'fa-pen';
        if (a.includes('exclu') || a.includes('delet') || a.includes('remov')) return 'fa-trash';
        return 'fa-eye';
    };

    const entries = DB.auditoria
        .filter(a => {
            if (filtroUsuario && !(a.usuario || '').toLowerCase().includes(filtroUsuario)) return false;
            if (filtroAcao && !(a.acao || '').toLowerCase().includes(filtroAcao)) return false;
            if (filtroInicio && a.timestamp < filtroInicio) return false;
            if (filtroFim && a.timestamp > filtroFim + 'T23:59:59') return false;
            return true;
        })
        .slice(0, 100);

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">Nenhum registro encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(a => {
        const acaoStyle = getAcaoStyle(a.acao);
        const acaoIcon = getAcaoIcon(a.acao);
        const inicial = (a.usuario || '?').charAt(0).toUpperCase();
        const resumo = (() => {
            try {
                const d = JSON.parse(a.detalhes);
                return d.descricao || d.nome || a.detalhes?.slice(0, 80) || '—';
            } catch { return (a.detalhes || '—').slice(0, 80); }
        })();
        const entidadeLabel = a.entidade ? `<span class="text-xs text-gray-400 ml-1">[${a.entidade}]</span>` : '';
        return `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">${new Date(a.timestamp).toLocaleString('pt-BR')}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style="background:#262261;">${inicial}</div>
                    <span class="font-medium" style="color:#262261;">${a.usuario || '—'}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style="${acaoStyle}">
                    <i class="fa-solid ${acaoIcon}" style="font-size:0.65rem;"></i>
                    ${a.acao || '—'}
                </span>
                ${entidadeLabel}
            </td>
            <td class="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">${resumo}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="openAuditoriaDetalhe('${a.id}')"
                    class="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Ver detalhes">
                    <i class="fa-solid fa-eye text-gray-500 text-sm"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}


function openAuditoriaDetalhe(entryId) {
    const entry = (DB.auditoria || []).find(a => String(a.id) === String(entryId));
    if (!entry) { showToast('Registro não encontrado', 'error'); return; }

    const dt = new Date(entry.timestamp);
    const dtStr = isNaN(dt) ? entry.timestamp : dt.toLocaleString('pt-BR', {
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit'
    });

    const getAcaoStyle = (acao = '') => {
        const a = acao.toLowerCase();
        if (a.includes('cri') || a.includes('add')) return 'background:rgba(34,197,94,0.1);color:#16a34a;';
        if (a.includes('edit') || a.includes('atualiz')) return 'background:rgba(59,130,246,0.1);color:#2563eb;';
        if (a.includes('exclu') || a.includes('delet')) return 'background:rgba(239,68,68,0.1);color:#dc2626;';
        return 'background:#f3f4f6;color:#374151;';
    };

    // Tentar parsear detalhes como JSON para exibir diff
    let diffHtml = '';
    let descricao = entry.detalhes || '—';
    try {
        const d = JSON.parse(entry.detalhes);
        descricao = d.descricao || d.nome || entry.detalhes;

        if (d.antes && d.depois) {
            const campos = [...new Set([...Object.keys(d.antes), ...Object.keys(d.depois)])];
            const linhas = campos
                .filter(c => String(d.antes[c] ?? '') !== String(d.depois[c] ?? ''))
                .map(c => `
                    <tr class="border-b border-gray-100">
                        <td class="py-2 pr-3 text-xs font-medium text-gray-500 whitespace-nowrap">${c}</td>
                        <td class="py-2 pr-3 text-xs text-red-600 line-through max-w-xs truncate">${d.antes[c] ?? '—'}</td>
                        <td class="py-2 text-xs text-green-600 font-medium max-w-xs truncate">${d.depois[c] ?? '—'}</td>
                    </tr>`).join('');

            if (linhas) {
                diffHtml = `
                <div class="mt-4">
                    <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Alterações</p>
                    <div class="bg-gray-50 rounded-lg overflow-hidden">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-gray-200">
                                    <th class="py-2 pr-3 text-left text-xs text-gray-400 font-medium">Campo</th>
                                    <th class="py-2 pr-3 text-left text-xs text-gray-400 font-medium">Antes</th>
                                    <th class="py-2 text-left text-xs text-gray-400 font-medium">Depois</th>
                                </tr>
                            </thead>
                            <tbody class="px-2">${linhas}</tbody>
                        </table>
                    </div>
                </div>`;
            }
        } else if (d.campos) {
            // Formato alternativo: [{campo, antes, depois}]
            const linhas = (d.campos || []).map(c => `
                <tr class="border-b border-gray-100">
                    <td class="py-2 pr-3 text-xs font-medium text-gray-500">${c.campo}</td>
                    <td class="py-2 pr-3 text-xs text-red-600 line-through">${c.antes ?? '—'}</td>
                    <td class="py-2 text-xs text-green-600 font-medium">${c.depois ?? '—'}</td>
                </tr>`).join('');
            if (linhas) {
                diffHtml = `<div class="mt-4"><p class="text-xs font-semibold text-gray-500 uppercase mb-2">Alterações</p>
                    <div class="bg-gray-50 rounded-lg p-3"><table class="w-full"><tbody>${linhas}</tbody></table></div></div>`;
            }
        }
    } catch { /* detalhes é string simples */ }

    const initial = (entry.usuario || '?').charAt(0).toUpperCase();
    const acaoStyle = getAcaoStyle(entry.acao);

    document.getElementById('auditoria-detalhe-content').innerHTML = `
        <div class="space-y-4">
            <!-- Data/hora -->
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <i class="fa-regular fa-clock text-gray-400"></i>
                <div>
                    <p class="text-xs text-gray-400 font-medium uppercase">Data e Hora</p>
                    <p class="text-sm font-semibold" style="color:#262261;">${dtStr}</p>
                </div>
            </div>

            <!-- Usuário -->
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style="background:#262261;">${initial}</div>
                <div>
                    <p class="text-xs text-gray-400 font-medium uppercase">Usuário</p>
                    <p class="text-sm font-semibold" style="color:#262261;">${entry.usuario || '—'}</p>
                </div>
            </div>

            <!-- Ação + Entidade -->
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <i class="fa-solid fa-bolt text-gray-400"></i>
                <div class="flex-1">
                    <p class="text-xs text-gray-400 font-medium uppercase">Ação</p>
                    <div class="flex items-center gap-2 mt-1 flex-wrap">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium" style="${acaoStyle}">${entry.acao || '—'}</span>
                        ${entry.entidade ? `<span class="text-xs px-2 py-1 bg-white border border-gray-200 rounded-full text-gray-600">${entry.entidade}</span>` : ''}
                    </div>
                </div>
            </div>

            <!-- Detalhes / Descrição -->
            <div class="p-3 bg-gray-50 rounded-lg">
                <p class="text-xs text-gray-400 font-medium uppercase mb-1">Descrição</p>
                <p class="text-sm text-gray-700">${descricao}</p>
            </div>

            ${diffHtml}
        </div>`;

    openModal('modal-auditoria-detalhe');
}

function renderStrategyTable() {
    const tbody = document.getElementById('table-estrategia-body');
    if (!tbody) return;

    const currentYear = new Date().getFullYear();
    const yearEntries = buildFinancialEntries().filter(e => getYearFromDate(e.data) === currentYear);
    const receitaBruta = yearEntries.filter(e => Number(e.valor||0) > 0).reduce((s,e) => s + Number(e.valor||0), 0);
    const custosVar    = yearEntries.filter(e => Number(e.valor||0) < 0).reduce((s,e) => s + Math.abs(Number(e.valor||0)), 0);
    const impostos     = receitaBruta * 0.15;
    const recLiquida   = receitaBruta - impostos;
    const margem       = recLiquida - custosVar;
    const despFixas    = custosVar * 0.30;
    const lucro        = margem - despFixas;

    const pct = v => receitaBruta > 0 ? Math.round((v / receitaBruta) * 100) + '%' : '—';
    const row = (label, val, colorCls, bold) => `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="p-4 ${bold ? 'font-bold' : ''} text-gray-800">${label}</td>
            <td class="p-4 text-right font-mono ${bold ? 'font-bold' : ''} ${colorCls}">${formatCurrency(val)}</td>
            <td class="p-4 text-right text-gray-500 ${bold ? 'font-bold' : ''}">${pct(val)}</td>
        </tr>`;

    tbody.innerHTML = [
        row('Receita Bruta',          receitaBruta, 'text-gray-800',                              false),
        row('(-) Impostos',           impostos,     'text-red-500',                               false),
        row('Receita Líquida',        recLiquida,   'text-gray-800',                              false),
        row('(-) Custos Variáveis',   custosVar,    'text-red-500',                               false),
        row('Margem de Contribuição', margem,       margem  >= 0 ? 'text-gray-800' : 'text-red-600', false),
        row('(-) Despesas Fixas',     despFixas,    'text-red-500',                               false),
        row('Lucro Operacional',      lucro,        lucro   >= 0 ? 'text-green-600' : 'text-red-600', true),
    ].join('');
}

function renderAnalytics() { 
    const financeCanvas = document.getElementById('chart-financeiro-anual');
    const patientsCanvas = document.getElementById('chart-pacientes-anual');
    if (!financeCanvas || !patientsCanvas || typeof Chart === 'undefined') return;

    const currentYear = new Date().getFullYear();
    const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const receitas = new Array(12).fill(0);
    const despesas = new Array(12).fill(0);
    const novosPacientes = new Array(12).fill(0);

    buildFinancialEntries().forEach(entry => {
        const year = getYearFromDate(entry.data);
        if (year !== currentYear) return;
        const month = getMonthFromDate(entry.data);
        const value = Number(entry.valor || 0);
        if (value >= 0) receitas[month] += value;
        else despesas[month] += Math.abs(value);
    });

    (DB.pacientes || []).forEach(patient => {
        const dateBase = patient.dataCadastro || patient.createdAt || getTodayISO();
        const year = getYearFromDate(dateBase);
        if (year !== currentYear) return;
        const month = getMonthFromDate(dateBase);
        novosPacientes[month] += 1;
    });

    if (financeChart) financeChart.destroy();
    if (patientsChart) patientsChart.destroy();

    financeChart = new Chart(financeCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Receita',
                    data: receitas,
                    backgroundColor: 'rgba(0, 244, 211, 0.85)',
                    borderRadius: 10,
                    borderSkipped: false
                },
                {
                    label: 'Despesa',
                    data: despesas,
                    backgroundColor: 'rgba(38, 34, 97, 0.85)',
                    borderRadius: 10,
                    borderSkipped: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => formatCurrency(value)
                    }
                }
            }
        }
    });

    patientsChart = new Chart(patientsCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Novos pacientes',
                data: novosPacientes,
                borderColor: '#00d4b8',
                backgroundColor: 'rgba(0, 244, 211, 0.12)',
                tension: 0.35,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

function renderStrategySection() {
    renderStrategyTable();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            renderAnalytics();
        });
    });
}

// ============================================
// EXPORTS
// ============================================

window.exportFinancialExcel = () => { 
    const entries = getFilteredFinancialEntries();
    const rows = entries.map(item => ({
        Data: formatDate((item.data || '').split('T')[0]),
        Descricao: item.descricao || item.tipo || '—',
        Tipo: getFinancialTypeLabel(getFinancialEntryType(item)),
        Categoria: getFinancialCategoryLabel(item.categoria),
        Status: getFinancialStatusLabel(item.status),
        Origem: item.origem || '—',
        Valor: Math.abs(Number(item.valor || 0)),
        Pagamento: item.metodo || item.origem || '—',
        Observacao: item.observacao || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Financeiro');
    XLSX.writeFile(workbook, `financeiro_${financialFilterYear}_${financialFilterMode === 'month' ? String(financialFilterMonth + 1).padStart(2, '0') : 'anual'}.xlsx`);
};

window.exportFinancialPDF = () => { 
    const entries = getFilteredFinancialEntries();
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        showToast('Biblioteca de PDF indisponível.', 'error');
        return;
    }

    const doc = new jsPDF();
    const periodLabel = financialFilterMode === 'month'
        ? `${String(financialFilterMonth + 1).padStart(2, '0')}/${financialFilterYear}`
        : `${financialFilterYear}`;

    doc.setFontSize(16);
    doc.text('Relatório Financeiro', 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${periodLabel}`, 14, 23);

    const body = entries.map(item => [
        formatDate((item.data || '').split('T')[0]),
        item.descricao || item.tipo || '—',
        getFinancialTypeLabel(getFinancialEntryType(item)),
        getFinancialCategoryLabel(item.categoria),
        getFinancialStatusLabel(item.status),
        formatCurrency(Math.abs(Number(item.valor || 0))),
        item.metodo || item.origem || '—'
    ]);

    const receitas = entries.filter(f => Number(f.valor || 0) > 0).reduce((s,f) => s + Number(f.valor || 0), 0);
    const despesas = entries.filter(f => Number(f.valor || 0) < 0).reduce((s,f) => s + Math.abs(Number(f.valor || 0)), 0);
    const saldo = receitas - despesas;

    doc.autoTable({
        startY: 28,
        head: [['Data', 'Descrição', 'Tipo', 'Categoria', 'Status', 'Valor', 'Pagamento']],
        body,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [111, 75, 54] }
    });

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 40;
    doc.text(`Receitas: ${formatCurrency(receitas)}`, 14, finalY);
    doc.text(`Despesas: ${formatCurrency(despesas)}`, 14, finalY + 7);
    doc.text(`Saldo: ${formatCurrency(saldo)}`, 14, finalY + 14);

    doc.save(`financeiro_${periodLabel.replace('/', '-')}.pdf`);
};

window.exportConsolidatedExcel = () => { 
    showToast('Exportando lista consolidada...', 'success'); 
};

window.exportConsolidatedPDF = () => { 
    showToast('Exportando PDF...', 'success'); 
};

// ============================================
// VISUAL ENHANCEMENTS
// ============================================

function initVisualEnhancements() {
    // Cards
    document.querySelectorAll('.bg-white.rounded.shadow').forEach(el => {
        if (!el.classList.contains('card') && !el.classList.contains('kpi-card')) {
            el.classList.add('card');
        }
    });
    
    // Botões primários
    document.querySelectorAll('button.bg-blue-600, button.bg-indigo-600, button.bg-green-600, button.bg-purple-600').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'bg-indigo-600', 'bg-green-600', 'bg-purple-600');
        btn.classList.add('btn-primary');
    });
    
    // Botões secundários
    document.querySelectorAll('button.bg-gray-200, button.border-gray-300, button.bg-gray-100').forEach(btn => {
        btn.classList.add('btn-secondary');
        btn.classList.remove('bg-gray-200', 'bg-gray-100');
    });
    
    // Navegação
    document.querySelectorAll('.nav-btn').forEach(nav => {
        nav.classList.remove('bg-white', 'border', 'rounded', 'shadow-sm', 'hover:bg-blue-50');
        nav.classList.add('nav-link');
    });
    
    // Ativar link ativo
    const activeSection = document.querySelector('main > section:not(.hidden)')?.id;
    document.querySelectorAll('.nav-link').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('onclick')?.includes(activeSection)) {
            nav.classList.add('active');
        }
    });
    
    // KPI Cards
    document.querySelectorAll('[id^="kpi-"]').forEach(el => {
        const card = el.closest('.p-6, .kpi-card');
        if (card && !card.classList.contains('kpi-card')) {
            card.classList.remove('p-6', 'bg-white', 'rounded-lg', 'shadow-md', 'border-l-4');
            card.classList.add('kpi-card');
            
            const valueEl = card.querySelector('.text-3xl');
            if (valueEl) {
                valueEl.classList.remove('text-3xl', 'text-gray-800');
                valueEl.classList.add('kpi-value');
            }
            
            const labelEl = card.querySelector('.text-sm.text-gray-500');
            if (labelEl) {
                labelEl.classList.remove('text-sm', 'text-gray-500');
                labelEl.classList.add('kpi-label');
            }
        }
    });
    
    // Tabelas
    document.querySelectorAll('.bg-white.rounded.shadow.overflow-hidden').forEach(tableWrapper => {
        if (!tableWrapper.classList.contains('table-container')) {
            tableWrapper.classList.remove('bg-white', 'rounded', 'shadow', 'overflow-hidden');
            tableWrapper.classList.add('table-container');
        }
    });
    
    // Títulos de seção
    const pageTitle = document.getElementById('page-title');
    if (pageTitle && !pageTitle.classList.contains('section-title')) {
        pageTitle.classList.remove('text-2xl', 'font-bold', 'text-gray-800', 'mb-6', 'border-b', 'pb-2');
        pageTitle.classList.add('section-title');
    }
}

// ============================================
// SIMULAÇÃO
// ============================================

function simulateUserFlow() {
    try {
        console.log('--- Iniciando simulação de uso ---');
        
        const today = new Date().toISOString().split('T')[0];
        
        // Criar agendamentos para hoje
        if (!DB.agendamentos.some(a => a.data === today && a.status !== 'Finalizado')) {
            const pacientesParaAgendar = ['3', '4', '5'];
            const horarios = ['09:00', '10:30', '14:00'];
            const tipos = ['Consulta', 'Retorno', 'Procedimento'];
            
            pacientesParaAgendar.forEach((pid, idx) => {
                const paciente = DB.pacientes.find(p => p.id === pid);
                if (paciente) {
                    DB.agendamentos.push({
                        id: 'ag_sim_' + idx + '_' + generateId(),
                        pacienteId: pid,
                        pacienteNome: paciente.nome,
                        data: today,
                        hora: horarios[idx % horarios.length],
                        motivo: tipos[idx % tipos.length],
                        tipo: tipos[idx % tipos.length],
                        valor: 150.00,
                        prioridade: idx === 0 ? 'Emergência' : 'Normal',
                        status: idx === 0 ? 'Aguardando' : 'Agendado',
                        sessoes: 1
                    });
                }
            });
            saveDB();
            console.log('Agendamentos de simulação criados');
        }
        
        renderCalendar();
        renderPacientes();
        renderAtendimentoScreen();
        
        // Iniciar atendimento automático
        const apptHoje = DB.agendamentos.find(a => a.data === today && a.status === 'Aguardando');
        if (apptHoje) {
            console.log('Iniciando atendimento automático para', apptHoje.pacienteNome);
            startConsultation(apptHoje.id);
            
            // Adicionar medicamentos e exames de exemplo
            if(DB.estoque && DB.estoque.length > 0) {
                tempPrescription.push({ 
                    id: DB.estoque[0].id, 
                    nome: DB.estoque[0].nome, 
                    qtd: 1, 
                    total: DB.estoque[0].preco 
                });
            }
            
            if(DB.catalogoExames && DB.catalogoExames.length > 0) {
                tempExams.push({ 
                    id: DB.catalogoExames[0].id, 
                    nome: DB.catalogoExames[0].nome, 
                    preco: DB.catalogoExames[0].preco 
                });
            }
            
            updateListsAndTotals();
        }
        
        console.log('--- Simulação finalizada ---');
    } catch (err) { 
        console.error('Erro na simulação:', err); 
    }
}

// ============================================
// INITIALIZATION
// ============================================

function logout() {
    localStorage.removeItem("medicore_session");
    location.reload();
}

window.showSection = function(id) {
    if (currentUserRole === "FUNCIONARIO" && (id === "financeiro" || id === "auditoria" || id === "estrategia" || id === "protocolos")) {
        showToast("Acesso restrito para funcionários", "error");
        return;
    }

    if (currentUserRole === "SECRETARIA" && !["protocolos", "pacientes", "agenda", "atendimento", "resgates-admin"].includes(id)) {
        showToast("Acesso restrito para secretaria", "error");
        return;
    }

    document.querySelectorAll("main > section").forEach(s => s.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");

    if (id === "dashboard" && typeof updateDashboard === "function") updateDashboard();
    if (id === "estrategia" && typeof renderStrategySection === "function") setTimeout(renderStrategySection, 80);
    if (id === "protocolos" && typeof renderProtocolos === "function") renderProtocolos();
    if (id === "estoque" && typeof renderEstoque === "function") renderEstoque();
    if (id === "auditoria" && typeof renderAuditoria === "function") renderAuditoria();
    if (id === "atendimento" && typeof renderAtendimentoScreen === "function") renderAtendimentoScreen();
    if (id === "pacientes" && typeof renderPacientes === "function") renderPacientes();
    if (id === "agenda" && typeof renderCalendar === "function") renderCalendar();
    if (id === "servicos" && typeof renderServicos === "function") renderServicos();
    if (id === "financeiro" && typeof renderFinancialReport === "function") setTimeout(renderFinancialReport, 30);
    if (id === "cupons") renderCouponsSection();
    if (id === "recompensas-admin" && typeof loadRewardsAdminSection === "function") {
    loadRewardsAdminSection();
    }
    if (id === "resgates-admin" && typeof loadRedemptionsAdminSection === "function") {
    loadRedemptionsAdminSection();
    }
    if (id === "relatorios" && typeof renderRelatorios === "function") renderRelatorios();

    const pageTitle = document.getElementById("page-title");
    if (pageTitle) pageTitle.innerText = getSectionTitle(id);

    document.querySelectorAll(".nav-link").forEach(nav => {
        nav.classList.remove("active");
        const onClick = nav.getAttribute("onclick") || "";
        if (onClick.includes(`'${id}'`) || onClick.includes(`\"${id}\"`)) {
            nav.classList.add("active");
        }
    });
};

window.onload = async function() {
    await loadDB();

    const savedSession = localStorage.getItem("medicore_session");
    const modalLogin = document.getElementById("modal-login");
    const headerUsername = document.getElementById("header-username");
    const userRoleBadge = document.getElementById("user-role-badge");

    if (savedSession) {
        try {
            const user = JSON.parse(savedSession);

            currentUserRole = user.tipo;
            fetch('api/restore_session.php', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({user_id: user.id}) }).catch(()=>{});
            DB.currentUser = user.nome;

            if (modalLogin) {
                modalLogin.classList.add("hidden");
                modalLogin.style.display = "none";
            }

            if (headerUsername) {
                headerUsername.innerHTML = `<i class="fa-regular fa-user mr-2"></i>${user.nome}`;
            }

            if (userRoleBadge) {
                userRoleBadge.innerHTML =
                    user.tipo === "ADMIN"
                        ? "Administrador"
                        : user.tipo === "SECRETARIA"
                            ? "Secretaria"
                            : "Funcionário";
            }

            const _hNomeR = document.getElementById("header-user-nome");
            const _hTipoR = document.getElementById("header-user-tipo");
            if (_hNomeR) _hNomeR.textContent = user.nome;
            if (_hTipoR) _hTipoR.textContent = user.tipo === "ADMIN" ? "Administrador" : user.tipo === "SECRETARIA" ? "Secretaria" : "Funcionário";

            if (typeof showSection === "function") {
                if (user.tipo === "SECRETARIA") {
                    document.querySelectorAll('.nav-link').forEach(nav => {
                        const onClick = nav.getAttribute('onclick') || '';
                        if (
                            !onClick.includes("'protocolos'") &&
                            !onClick.includes("'pacientes'") &&
                            !onClick.includes("'agenda'") &&
                            !onClick.includes("'atendimento'") &&
                            !onClick.includes("'resgates-admin'")
                        ) {
                            nav.style.display = 'none';
                        }
                    });
                    showSection("agenda");
                } else {
                    showSection("dashboard");
                }
            } else {
                const targetId = user.tipo === "SECRETARIA" ? "agenda" : "dashboard";
                const target = document.getElementById(targetId);
                if (target) {
                    document.querySelectorAll("main > section").forEach(s => s.classList.add("hidden"));
                    target.classList.remove("hidden");
                }
            }

            if (user.tipo !== "SECRETARIA" && typeof updateDashboard === "function") updateDashboard();
            if (typeof initVisualEnhancements === "function") initVisualEnhancements();
            syncAdminCouponNav();
            syncAdminRewardsNav();
            if (typeof renderCalendar === "function") renderCalendar();

            return;
        } catch (e) {
            console.error("Erro ao restaurar sessão:", e);
            localStorage.removeItem("medicore_session");
        }
    }

    if (modalLogin) {
        modalLogin.classList.remove("hidden");
        modalLogin.style.display = "";
    }

    if (typeof renderCalendar === "function") renderCalendar();

    setTimeout(() => {
        if (typeof initVisualEnhancements === "function") {
            initVisualEnhancements();
        syncAdminCouponNav();
        }
    }, 100);
};

// Executar simulação se ativa
if (typeof SIMULATE_TESTS !== 'undefined' && SIMULATE_TESTS) {
    setTimeout(simulateUserFlow, 800);
};
// ============================================
// EXPORT GLOBAL FUNCTIONS
// ============================================

window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.resetSystem = resetSystem;
window.changeMonth = changeMonth;
window.goToToday = goToToday;
window.checkIn = checkIn;
window.startConsultation = startConsultation;
window.addMedicationToPrescription = addMedicationToPrescription;
window.addExamToConsultation = addExamToConsultation;
window.proceedToPayment = proceedToPayment;
window.confirmPayment = confirmPayment;
window.editPatient = editPatient;
window.editProtocol = editProtocol;
window.openPatientReport = openPatientReport;
window.renderPatientQuickReport = renderPatientQuickReport;
window.openFullReportFromQuick = openFullReportFromQuick;
window.openSellProtocolModal = openSellProtocolModal;
window.openAnamneseHistory = openAnamneseHistory;
window.viewAnamneseDetail = viewAnamneseDetail;
window.initVisualEnhancements = initVisualEnhancements;

document.addEventListener('keydown', function (e) {
    const modal = document.getElementById('modal-login');
    if (!modal || modal.classList.contains('hidden')) return;

    if (e.key === 'Enter') {
        const email = document.getElementById('login-email');
        const senha = document.getElementById('login-senha');

        if (document.activeElement === email || document.activeElement === senha) {
            login();
        }
    }
});

// ===== EDITAR AGENDAMENTO =====
window.editAppointment = function(id) {
    const ag = DB.agendamentos.find(a => a.id === id);
    if (!ag) return alert('Agendamento não encontrado');

    window.__editingAppointmentId = ag.id;

    openModal('modal-agendamento', ag.data);

    document.getElementById('ag-paciente').value = ag.pacienteId || '';
    document.getElementById('ag-data').value = ag.data || '';
    document.getElementById('ag-hora').value = ag.hora || '';
    document.getElementById('ag-motivo').value = ag.motivo || '';
    document.getElementById('ag-tipo').value = ag.tipo || '';
    document.getElementById('ag-valor').value = ag.valor || '';
    document.getElementById('ag-prioridade').value = ag.prioridade || 'Normal';
    document.getElementById('ag-qtd-sessoes').value = ag.sessoes || 1;
};

// ===== EXCLUIR AGENDAMENTO =====
window.deleteAppointment = async function(id) {
    if (!confirm('Deseja excluir este agendamento?')) return;

    const ag = DB.agendamentos.find(a => a.id === id);

    try {
        await fetch(`/api/appointments.php?id=${id}`, { method: 'DELETE' });

        DB.agendamentos = DB.agendamentos.filter(a => a.id !== id);
        saveDB();

        if (ag?.pacienteId) {
            await registerPatientLog(
                ag.pacienteId,
                'Agendamento removido',
                `Agendamento removido de ${formatDate(ag.data)} às ${ag.hora} • ${ag.tipo}`
            );
        }

        renderCalendar();
        updateDashboard();

        alert('Agendamento excluído');
    } catch (err) {
        console.error(err);
        alert('Erro ao excluir');
    }
};

// ===== BLOQUEIO DE HORÁRIO + SUGESTÕES =====
function isBlockingAppointmentStatus(status) {
    return !['Finalizado', 'Cancelado'].includes(status || '');
}

function normalizeDateString(v) {
    return String(v || '').slice(0, 10);
}

function normalizeTimeString(v) {
    return String(v || '').slice(0, 5);
}

function isSlotOccupied(date, hora, ignoreId = null) {
    const d = normalizeDateString(date);
    const h = normalizeTimeString(hora);

    return (DB.agendamentos || []).some(a => {
        const sameDate = normalizeDateString(a.data || a.data_consulta) === d;
        const sameTime = normalizeTimeString(a.hora || a.hora_consulta) === h;
        const sameId = String(a.id) === String(ignoreId);
        return sameDate && sameTime && !sameId && isBlockingAppointmentStatus(a.status);
    });
}

function getNextFreeSlots(date, hora, count = 3, ignoreId = null) {
    const results = [];
    if (!date || !hora) return results;

    const [hh, mm] = normalizeTimeString(hora).split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return results;

    let cursor = new Date(`${normalizeDateString(date)}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);

    for (let i = 0; i < 20 && results.length < count; i++) {
        cursor.setMinutes(cursor.getMinutes() + 30);
        const sug = `${String(cursor.getHours()).padStart(2,'0')}:${String(cursor.getMinutes()).padStart(2,'0')}`;

        if (cursor.getHours() > 22 || (cursor.getHours() === 22 && cursor.getMinutes() > 0)) {
            break;
        }

        if (!isSlotOccupied(date, sug, ignoreId)) {
            results.push(sug);
        }
    }

    return results;
}

function renderTimeSuggestions(date, hora, ignoreId = null) {
    const box = document.getElementById('ag-sugestoes');
    if (!box) return;

    box.innerHTML = '';

    if (!date || !hora) return;

    if (!isSlotOccupied(date, hora, ignoreId)) {
        box.innerHTML = '<span class="text-green-600">Horário disponível.</span>';
        return;
    }

    const suggestions = getNextFreeSlots(date, hora, 4, ignoreId);

    if (!suggestions.length) {
        box.innerHTML = '<span class="text-red-600">Horário ocupado e não encontrei sugestões próximas.</span>';
        return;
    }

    box.innerHTML = `
        <div class="text-red-600 mb-1">Horário ocupado.</div>
        <div class="flex flex-wrap gap-2">
            ${suggestions.map(s => `
                <button type="button"
                        onclick="pickSuggestedTime('${s}')"
                        class="px-2 py-1 rounded border border-[#CBE5F7] bg-white hover:bg-[#FCF7F9] text-[#6F4B36]">
                    ${s}
                </button>
            `).join('')}
        </div>
    `;
}

window.pickSuggestedTime = function(hora) {
    const campoHora = document.getElementById('ag-hora');
    const campoData = document.getElementById('ag-data');
    if (campoHora) campoHora.value = hora;
    renderTimeSuggestions(campoData ? campoData.value : '', hora, window.__editingAppointmentId || null);
};

// Atualiza sugestões ao mexer na data/hora
document.addEventListener('change', function(e) {
    if (e.target && (e.target.id === 'ag-data' || e.target.id === 'ag-hora')) {
        const data = document.getElementById('ag-data')?.value || '';
        const hora = document.getElementById('ag-hora')?.value || '';
        renderTimeSuggestions(data, hora, window.__editingAppointmentId || null);
    }
});

document.addEventListener('input', function(e) {
    if (e.target && (e.target.id === 'ag-data' || e.target.id === 'ag-hora')) {
        const data = document.getElementById('ag-data')?.value || '';
        const hora = document.getElementById('ag-hora')?.value || '';
        renderTimeSuggestions(data, hora, window.__editingAppointmentId || null);
    }
});

// ===== WHATSAPP SEMI-PRONTO =====
window.openAppointmentWhatsApp = async function(id) {
    const ag = DB.agendamentos.find(a => a.id === id);
    if (!ag) {
        alert('Agendamento não encontrado');
        return;
    }

    const paciente = DB.pacientes.find(p => p.id === ag.pacienteId);
    const telefoneRaw = (paciente && (paciente.tel || paciente.telefone || paciente.celular || paciente.whatsapp)) || '';

    if (!telefoneRaw) {
        alert('Paciente sem telefone');
        return;
    }

    let telefone = telefoneRaw.replace(/\D/g, '');
    if (!telefone.startsWith('55')) telefone = '55' + telefone;

    const sessoes = ag.group_id
        ? DB.agendamentos
            .filter(a => a.group_id === ag.group_id)
            .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`))
        : [ag];

    const lista = sessoes.map(s => `${formatDate(s.data)} às ${s.hora}`).join('\n');

    let confirmUrl = '';
    let cancelUrl = '';

    try {
        const res = await fetch(`/api/get_appointment_action_links.php?appointment_id=${encodeURIComponent(ag.id)}&group_id=${encodeURIComponent(ag.group_id || '')}`);
        const data = await res.json();
        if (data.ok) {
            confirmUrl = data.confirm_url || '';
            cancelUrl = data.cancel_url || '';
        }
    } catch (err) {
        console.error('Erro ao buscar links de ação:', err);
    }

    const msg = `Olá ${ag.pacienteNome},\n\nSuas consultas:\n${lista}\n\n${confirmUrl ? 'Confirmar: ' + confirmUrl + '\n' : ''}${cancelUrl ? 'Cancelar: ' + cancelUrl + '\n' : ''}\nMediCore`;
    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(msg)}`;

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
};


// ===== EXPORT GLOBAL FUNCTIONS (restaurado) =====
window.login = login;
window.logout = logout;
window.showSection = showSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.changeMonth = changeMonth;
window.goToToday = goToToday;
window.checkIn = checkIn;
window.startConsultation = startConsultation;
window.addMedicationToPrescription = addMedicationToPrescription;
window.addExamToConsultation = addExamToConsultation;
window.proceedToPayment = proceedToPayment;
window.confirmPayment = confirmPayment;
window.editPatient = editPatient;
window.editProtocol = editProtocol;
window.deleteProtocol = deleteProtocol;
window.deleteAppointment = deleteAppointment;
window.editAppointment = editAppointment;
window.openPatientReport = openPatientReport;
window.renderPatientQuickReport = renderPatientQuickReport;
window.openFullReportFromQuick = openFullReportFromQuick;
window.openSellProtocolModal = openSellProtocolModal;
window.openAnamneseHistory = openAnamneseHistory;
window.viewAnamneseDetail = viewAnamneseDetail;
window.pickSuggestedTime = pickSuggestedTime;
window.openAppointmentWhatsApp = openAppointmentWhatsApp;


// ===== RENDER LOG PACIENTE =====
async function renderPatientLogs(pacienteId) {
    try {
        const res = await fetch('/api/get_patient_logs.php?paciente_id=' + pacienteId);
        const data = await res.json();

        const el = document.getElementById('patient-log-list');
        if (!el) return;

        if (!data.items || data.items.length === 0) {
            el.innerHTML = '<div class="text-gray-400">Nenhum histórico</div>';
            return;
        }

        el.innerHTML = data.items.map(log => `
            <div class="bg-[#FCF7F9] border border-[#CBE5F7] p-2 rounded-lg">
                <div class="font-semibold">${log.acao}</div>
                <div class="text-xs text-gray-500">${log.descricao}</div>
                <div class="text-xs text-gray-400">${log.created_at}</div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Erro ao carregar logs', err);
    }
}


window.__appliedCoupon = null;

function applyCoupon() {
    const code = (document.getElementById('pag-cupom')?.value || '').trim().toUpperCase();
    const feedback = document.getElementById('cupom-feedback');

    if (!code) {
        if (feedback) feedback.innerHTML = '<span class="text-red-500">Digite um cupom.</span>';
        return;
    }

    const cupom = (DB.cupons || []).find(c => c.codigo === code && c.ativo);
    if (!cupom) {
        window.__appliedCoupon = null;
        if (feedback) feedback.innerHTML = '<span class="text-red-500">Cupom inválido ou inativo.</span>';
        return;
    }

    window.__appliedCoupon = cupom;

    if (typeof updateListsAndTotals === 'function') {
        updateListsAndTotals();
    }

    if (feedback) {
        feedback.innerHTML = `<span class="text-green-600">Cupom aplicado: ${cupom.codigo}</span>`;
    }

    const appt = DB.agendamentos.find(a => a.id === currentConsultationId);
    const patientId = appt?.pacienteId || currentQuickPatientId || null;
    if (patientId) {
        registerPatientLog(
            patientId,
            'Cupom aplicado',
            `Cupom ${cupom.codigo} aplicado (${cupom.tipo} • ${cupom.valor})`
        );
    }
}


// mostrar botão de cupom só para admin
setTimeout(() => {
    const btn = document.getElementById('admin-cupom-btn');
    if (btn && currentUserRole === 'ADMIN') {
        btn.classList.remove('hidden');
    }
}, 300);


function updateSellProtocolTotals() {
    const select = document.getElementById('sell-prot-select');
    const descontoField = document.getElementById('sell-prot-desconto');
    const valorBaseField = document.getElementById('sell-prot-valor-base');
    const totalField = document.getElementById('sell-prot-total');

    if (!select || !valorBaseField || !totalField) return;

    const protocolo = (DB.protocolos || []).find(p => p.id === select.value);
    const valorBase = Number(protocolo?.valor || 0);
    const desconto = Math.max(0, Number(descontoField?.value || 0));
    const total = Math.max(0, valorBase - desconto);

    valorBaseField.value = formatCurrency(valorBase);
    totalField.innerText = formatCurrency(total);
}

document.addEventListener('change', function(e) {
    if (e.target && (e.target.id === 'sell-prot-select' || e.target.id === 'sell-prot-desconto')) {
        updateSellProtocolTotals();
    }
});

document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'sell-prot-desconto') {
        updateSellProtocolTotals();
    }
});


function isCouponValid(cupom){
    if(!cupom || !cupom.ativo) return false

    const hoje = new Date()
    const ini = cupom.validadeInicio ? new Date(cupom.validadeInicio) : null
    const fim = cupom.validadeFim ? new Date(cupom.validadeFim) : null

    if(ini && hoje < ini) return false
    if(fim && hoje > fim) return false

    return true
}


function syncAdminCouponNav(){
    const btn = document.getElementById('nav-cupons-btn')
    if(!btn) return

    if(currentUserRole === 'ADMIN'){
        btn.classList.remove('hidden')
    }else{
        btn.classList.add('hidden')
    }
}


function renderCouponsSection(){
    const tbody = document.getElementById('table-cupons-body');
    if(!tbody) return;

    const cupons = DB.cupons || [];

    if(!cupons.length){
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">
            <i class="fa-solid fa-ticket text-3xl mb-2" style="color:#d1d5db;"></i>
            <p class="mt-2">Nenhum cupom cadastrado.</p>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = cupons.map(c => {
        const isAtivo  = c.ativo === true || c.ativo === 1 || c.ativo === '1';
        const usos     = Number(c.usos  || 0);
        const limite   = (c.limite !== undefined && c.limite !== '' && c.limite !== null)
                            ? Number(c.limite) : null;
        const esgotado = limite !== null && usos >= limite;

        const statusLabel = esgotado ? 'Esgotado' : (isAtivo ? 'Ativo' : 'Inativo');
        const statusStyle = esgotado
            ? 'background:#f3f4f6;color:#6b7280;'
            : (isAtivo
                ? 'background:#00d4b8;color:#262261;'
                : 'background:#fee2e2;color:#b91c1c;');

        const descontoLabel = c.tipo === 'percentual'
            ? `${c.valor}%`
            : `R$ ${Number(c.valor).toFixed(2).replace('.', ',')}`;

        const limitLabel = limite !== null ? limite : '∞';
        const validade   = c.validadeFim || c.validadeInicio || '-';

        return `<tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <code class="font-mono font-bold" style="color:#262261;">${c.codigo}</code>
                    <button type="button" title="Copiar código"
                        onclick="navigator.clipboard.writeText('${c.codigo}').then(()=>showToast('Copiado!'))"
                        class="p-1 hover:bg-gray-100 rounded transition-colors">
                        <i class="fa-regular fa-copy text-gray-500 text-xs"></i>
                    </button>
                </div>
            </td>
            <td class="px-6 py-4 font-medium" style="color:#00d4b8;">${descontoLabel}</td>
            <td class="px-6 py-4 text-gray-600">${usos} / ${limitLabel}</td>
            <td class="px-6 py-4 text-gray-600 text-sm">${validade}</td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                    style="${statusStyle}">${statusLabel}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <button type="button" onclick="editCupom('${c.id}')"
                        class="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Editar">
                        <i class="fa-solid fa-pen text-gray-500 text-xs"></i>
                    </button>
                    <button type="button" onclick="deleteCupom('${c.id}')"
                        class="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                        <i class="fa-solid fa-trash text-red-500 text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function editCupom(id) {
    const c = (DB.cupons || []).find(x => String(x.id) === String(id));
    if (!c) { showToast('Cupom não encontrado', 'error'); return; }

    const idField = document.getElementById('cupom-id');
    if (idField) idField.value = c.id;

    document.getElementById('cupom-codigo').value        = c.codigo || '';
    document.getElementById('cupom-tipo').value          = c.tipo   || 'percentual';
    document.getElementById('cupom-valor').value         = c.valor  || '';
    document.getElementById('cupom-ativo').value         = (c.ativo === true || c.ativo === 1) ? '1' : '0';
    const vi = document.getElementById('cupom-validade-inicio');
    const vf = document.getElementById('cupom-validade-fim');
    const lm = document.getElementById('cupom-limite');
    if (vi) vi.value = c.validadeInicio || '';
    if (vf) vf.value = c.validadeFim    || '';
    if (lm) lm.value = (c.limite !== null && c.limite !== undefined) ? c.limite : '';

    const title = document.querySelector('#modal-cupom h3');
    if (title) title.textContent = 'Editar Cupom';
    const btn = document.querySelector('#form-cupom button[type="submit"]');
    if (btn) btn.textContent = 'Salvar Alterações';

    openModal('modal-cupom');
}

async function deleteCupom(id) {
    if (!confirm('Excluir este cupom?')) return;
    try {
        if (USING_RESOURCE_APIS) {
            const res = await fetch('api/cupons.php?id=' + encodeURIComponent(id), {
                method: 'DELETE', credentials: 'same-origin'
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao excluir');
        }
        DB.cupons = (DB.cupons || []).filter(x => String(x.id) !== String(id));
        saveDB();
        renderCouponsSection();
        logAudit('Deletou', 'Cupom', '');
        showToast('Cupom excluído.');
    } catch(err) {
        showToast(err.message || 'Erro ao excluir cupom', 'error');
    }
}

/* =========================
   RECOMPENSAS ADMIN (CLUBE)
========================= */

async function fetchAdminRewards() {
    const res = await fetch('/api-clube/admin_rewards.php', {
        method: 'GET',
        credentials: 'same-origin'
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar recompensas');
    }

    return data.items || [];
}

function renderRewardsAdminTable(items = []) {
    const grid = document.getElementById('recompensas-admin-grid');
    if (!grid) return;

    if (!items.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500">
            <i class="fa-solid fa-gift text-4xl mb-3" style="color:#d1d5db;"></i>
            <p>Nenhuma recompensa cadastrada.</p>
        </div>`;
        return;
    }

    grid.innerHTML = items.map(item => {
        const isAtivo = Number(item.ativo) === 1;
        const estoqueVal = item.estoque === null || item.estoque === '' ? null : Number(item.estoque);
        const estoqueLabel = estoqueVal === null ? 'Ilimitado' : estoqueVal;
        const esgotado = estoqueVal !== null && estoqueVal === 0;
        const statusLabel = esgotado ? 'Esgotado' : (isAtivo ? 'Ativo' : 'Inativo');
        const statusStyle = esgotado
            ? 'background:#f3f4f6;color:#374151;'
            : (isAtivo
                ? 'background:#00d4b8;color:#262261;'
                : 'background:#fef9c3;color:#a16207;');
        const resgatados = item.total_resgates || item.resgates || 0;

        return `
            <div class="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all">
                <div class="flex items-start justify-between mb-4">
                    <div class="w-12 h-12 rounded-lg flex items-center justify-center" style="background:#262261;">
                        <i class="fa-solid fa-gift" style="color:#00d4b8;font-size:1.25rem;"></i>
                    </div>
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium" style="${statusStyle}">${statusLabel}</span>
                </div>

                <h3 class="text-lg font-bold mb-1" style="color:#262261;">${item.nome}</h3>
                ${item.tipo ? `<p class="text-xs text-gray-500 mb-2">${item.tipo}</p>` : ''}
                <p class="text-2xl font-bold mb-4" style="color:#00d4b8;">${Number(item.pontos).toLocaleString('pt-BR')} pts</p>

                <div class="space-y-2 mb-4">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-600">Disponíveis:</span>
                        <span class="font-medium" style="color:#262261;">${estoqueLabel}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-600">Resgatados:</span>
                        <span class="font-medium" style="color:#262261;">${resgatados}</span>
                    </div>
                </div>

                <div class="flex items-center gap-2 pt-4 border-t border-gray-200">
                    <button onclick="editRewardAdmin(${item.id})" class="flex-1 py-2 rounded-lg transition-colors hover:bg-gray-100 text-sm text-gray-600 flex items-center justify-center gap-1">
                        <i class="fa-solid fa-pen text-xs"></i> Editar
                    </button>
                    <button onclick="deleteRewardAdmin(${item.id})" class="flex-1 py-2 rounded-lg transition-colors hover:bg-red-50 text-sm text-red-500 flex items-center justify-center gap-1">
                        <i class="fa-solid fa-trash text-xs"></i> Excluir
                    </button>
                </div>
            </div>`;
    }).join('');
}

async function loadRewardsAdminSection() {
    try {
        const items = await fetchAdminRewards();
        window.__adminRewardsCache = items;
        renderRewardsAdminTable(items);
    } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao carregar recompensas');
    }
}

function openRewardAdminModal() {
    document.getElementById('reward-admin-id').value = '';
    document.getElementById('reward-admin-nome').value = '';
    document.getElementById('reward-admin-descricao').value = '';
    document.getElementById('reward-admin-pontos').value = '';
    document.getElementById('reward-admin-tipo').value = 'desconto';
    document.getElementById('reward-admin-estoque').value = '';
    document.getElementById('reward-admin-ativo').value = '1';

    openModal('modal-recompensa-admin');
}

function editRewardAdmin(id) {
    const item = (window.__adminRewardsCache || []).find(i => i.id == id);
    if (!item) return;

    document.getElementById('reward-admin-id').value = item.id;
    document.getElementById('reward-admin-nome').value = item.nome;
    document.getElementById('reward-admin-descricao').value = item.descricao || '';
    document.getElementById('reward-admin-pontos').value = item.pontos;
    document.getElementById('reward-admin-tipo').value = item.tipo;
    document.getElementById('reward-admin-estoque').value = item.estoque === null ? '' : item.estoque;
    document.getElementById('reward-admin-ativo').value = item.ativo ? '1' : '0';

    openModal('modal-recompensa-admin');
}

async function deleteRewardAdmin(id) {
    if (!confirm('Deseja excluir esta recompensa?')) return;

    try {
        const res = await fetch('/api-clube/admin_rewards.php?id=' + id, {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        alert('Excluído com sucesso');
        loadRewardsAdminSection();
    } catch (err) {
        alert(err.message);
    }
}

/* handler duplicado removido — form-recompensa-admin já tratado no listener principal */

function syncAdminRewardsNav(){
    const btn = document.getElementById('nav-recompensas-btn');
    if(!btn) return;

    if(currentUserRole === 'ADMIN' || currentUserRole === 'SECRETARIA'){
        btn.classList.remove('hidden');
    }else{
        btn.classList.add('hidden');
    }
}


/* =========================
   RESGATES ADMIN (CLUBE)
========================= */

async function fetchAdminRedemptions() {
    const res = await fetch('/api-clube/admin_redemptions.php', {
        method: 'GET',
        credentials: 'same-origin'
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar resgates');
    }

    return data.items || [];
}

function getRedemptionStatusLabel(status) {
    const map = {
        pendente: 'Pendente',
        entregue: 'Entregue',
        utilizado: 'Utilizado',
        cancelado: 'Cancelado'
    };
    return map[status] || status || '-';
}

function getRedemptionStatusBadge(status) {
    if (status === 'pendente') return 'badge-warning';
    if (status === 'entregue') return 'badge-secondary';
    if (status === 'utilizado') return 'badge-success';
    if (status === 'cancelado') return 'badge-danger';
    return 'badge-secondary';
}

function renderRedemptionsAdminTable(items = []) {
    const tbody = document.getElementById('table-resgates-admin-body');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Nenhum resgate registrado.</td></tr>';
        return;
    }

    window.__adminRedemptionsCache = items;

    tbody.innerHTML = items.map(item => {
        const status = String(item.status || 'pendente');
        const isPendente = status === 'pendente';

        const statusStyle = status === 'entregue' || status === 'utilizado'
            ? 'background:rgba(34,197,94,0.1);color:#16a34a;'
            : status === 'cancelado'
                ? 'background:rgba(239,68,68,0.1);color:#dc2626;'
                : 'background:rgba(234,179,8,0.15);color:#a16207;';

        const statusLabel = getRedemptionStatusLabel(status);

        const data = item.created_at
            ? new Date(item.created_at).toLocaleDateString('pt-BR')
            : '—';

        const acoes = isPendente
            ? `<div class="flex items-center gap-2">
                <button onclick="updateRedemptionStatus(${item.id},'entregue')" class="p-2 rounded-lg transition-colors" style="background:rgba(34,197,94,0.1);" onmouseover="this.style.background='rgba(34,197,94,0.2)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'" title="Aprovar">
                    <i class="fa-solid fa-check" style="color:#16a34a;font-size:0.875rem;"></i>
                </button>
                <button onclick="updateRedemptionStatus(${item.id},'cancelado')" class="p-2 rounded-lg transition-colors" style="background:rgba(239,68,68,0.1);" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'" title="Rejeitar">
                    <i class="fa-solid fa-xmark" style="color:#dc2626;font-size:0.875rem;"></i>
                </button>
               </div>`
            : '<span class="text-gray-400 text-sm">—</span>';

        return `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4">
                <p class="font-medium" style="color:#262261;">${item.club_user_nome || item.patient_id || '—'}</p>
            </td>
            <td class="px-6 py-4 text-gray-600">${item.reward_nome || '—'}</td>
            <td class="px-6 py-4 font-medium" style="color:#00d4b8;">${Number(item.pontos_gastos || 0).toLocaleString('pt-BR')} pts</td>
            <td class="px-6 py-4 text-gray-600">${data}</td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium" style="${statusStyle}">${statusLabel}</span>
            </td>
            <td class="px-6 py-4">${acoes}</td>
        </tr>`;
    }).join('');
}

async function loadRedemptionsAdminSection() {
    try {
        const items = await fetchAdminRedemptions();
        window.__adminRedemptionsCache = items;
        renderRedemptionsAdminTable(items);
    } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao carregar resgates');
    }
}

async function updateRedemptionStatus(id, status) {
    try {
        const res = await fetch('/api-clube/admin_redemptions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ id, status, observacao: '' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Erro ao atualizar resgate');
        showToast(data.message || 'Resgate atualizado', 'success');
        loadRedemptionsAdminSection();
    } catch (err) {
        showToast(err.message || 'Erro ao atualizar resgate', 'error');
    }
}

function editRedemptionAdmin(id) {
    const item = (window.__adminRedemptionsCache || []).find(i => Number(i.id) === Number(id));
    if (!item) return;

    document.getElementById('redeem-admin-id').value = item.id;
    document.getElementById('redeem-admin-paciente').value = item.club_user_nome || item.patient_id || '';
    document.getElementById('redeem-admin-premio').value = item.reward_nome || '';
    document.getElementById('redeem-admin-status').value = item.status || 'pendente';
    document.getElementById('redeem-admin-observacao').value = item.observacao || '';

    openModal('modal-resgate-admin');
}


function updatePaymentModalWithRedemption(baseValue) {
    const totalEl = document.getElementById('pay-total-val');
    const infoEl = document.getElementById('pay-redemption-info');
    if (!totalEl) return baseValue;

    let finalValue = Number(baseValue || 0);

    if (window.__activeRedemption && String(window.__activeRedemption.status || '') === 'pendente') {
        const discount = Math.max(0, Number(window.__activeRedemption.pontos_gastos || 0));
        finalValue = Math.max(0, finalValue - discount);

        if (infoEl) {
            infoEl.classList.remove('hidden');
            infoEl.innerHTML = `<strong>Resgate aplicado:</strong> ${window.__activeRedemption.reward_nome} • Desconto de ${formatCurrency(discount)}`;
        }
    } else if (infoEl) {
        infoEl.classList.add('hidden');
        infoEl.innerHTML = '';
    }

    totalEl.innerText = formatCurrency(finalValue);
    return finalValue;
}


// ============================
// RESGATE ATIVO GLOBAL
// ============================
window.__activeRedemption = null;

function applyRedemption(id) {
    const item = (window.__adminRedemptionsCache || []).find(i => Number(i.id) === Number(id));
    if (!item) return;

    if (String(item.status || '') !== 'pendente') {
        alert('Este resgate não está disponível.');
        return;
    }

    if (!/desconto/i.test(String(item.reward_nome || ''))) {
        alert('Este resgate não é um desconto.');
        return;
    }

    window.__activeRedemption = item;
    alert(`Desconto preparado: ${item.reward_nome}`);
}

// ============================
// ACESSO AO CLUBE A PARTIR DO MEDICORE
// ============================
async function generateClubAccessForCurrentPatient() {
    if (!currentQuickPatientId) {
        alert('Nenhum paciente selecionado.');
        return;
    }

    const patient = (DB.pacientes || []).find(p => String(p.id) === String(currentQuickPatientId));
    if (!patient) {
        alert('Paciente não encontrado.');
        return;
    }

    try {
        const res = await fetch('/api-clube/create_from_patient.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                patient_id: patient.id,
                patient_nome: patient.nome || '',
                patient_email: patient.email || '',
                patient_telefone: patient.tel || patient.telefone || ''
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || 'Erro ao gerar acesso ao Clube');
        }

        if (data.already_exists) {
            alert(
                `Este paciente já possui acesso ao Clube.\n\n` +
                `Nome: ${data.club_user?.nome || '-'}\n` +
                `Email: ${data.club_user?.email || '-'}\n` +
                `Telefone: ${data.club_user?.telefone || '-'}\n` +
                `Código de indicação: ${data.club_user?.referral_code || '-'}`
            );
            return;
        }

        alert(
            `Acesso ao Clube criado com sucesso.\n\n` +
            `Paciente: ${data.club_user?.nome || '-'}\n` +
            `Email: ${data.club_user?.email || '-'}\n` +
            `Telefone: ${data.club_user?.telefone || '-'}\n` +
            `Senha temporária: ${data.temporary_password || '-'}\n` +
            `Código de indicação: ${data.club_user?.referral_code || '-'}\n\n` +
            `Oriente o paciente a acessar o Clube e alterar a senha depois do primeiro login.`
        );
    } catch (err) {
        console.error(err);
        alert(err.message || 'Erro ao gerar acesso ao Clube');
    }
}

window.generateClubAccessForCurrentPatient = generateClubAccessForCurrentPatient;

// ============================
// MENU RÁPIDO DE EVENTO NO CALENDÁRIO
// ============================
window.__calendarEventMenuId = null;

function openCalendarEventMenu(id) {
    const ev = (DB.agendamentos || []).find(a => String(a.id) === String(id));
    if (!ev) return;

    const appointmentModal = document.getElementById('modal-agendamento');
    if (appointmentModal && !appointmentModal.classList.contains('hidden')) {
        closeModal('modal-agendamento');
    }

    window.__calendarEventMenuId = id;

    const title = document.getElementById('calendar-event-menu-title');
    const subtitle = document.getElementById('calendar-event-menu-subtitle');

    if (title) title.innerText = ev.pacienteNome || 'Agendamento';
    if (subtitle) subtitle.innerText = `${ev.hora || ''} • ${ev.tipo || ''} • ${ev.status || 'Agendado'}`;

    openModal('modal-calendar-event-menu');
}

function handleCalendarEventWhatsApp() {
    if (!window.__calendarEventMenuId) return;
    openAppointmentWhatsApp(window.__calendarEventMenuId);
}

function handleCalendarEventEdit() {
    if (!window.__calendarEventMenuId) return;
    const id = window.__calendarEventMenuId;
    closeModal('modal-calendar-event-menu');
    editAppointment(id);
}

async function handleCalendarEventDelete() {
    if (!window.__calendarEventMenuId) return;
    const id = window.__calendarEventMenuId;
    closeModal('modal-calendar-event-menu');
    await deleteAppointment(id);
}

function handleCalendarEventStart() {
    if (!window.__calendarEventMenuId) return;
    const ev = (DB.agendamentos || []).find(a => String(a.id) === String(window.__calendarEventMenuId));
    if (!ev) return;

    closeModal('modal-calendar-event-menu');

    if (typeof startConsultation === 'function') {
        startConsultation(ev.id);
        if (typeof showSection === 'function') {
            showSection('atendimento');
        }
    }
}


function handleCalendarDayClick(dateStr) {
    const eventMenu = document.getElementById('modal-calendar-event-menu');
    if (eventMenu && !eventMenu.classList.contains('hidden')) {
        closeModal('modal-calendar-event-menu');
    }

    openNewAppointmentModal(dateStr);
}

// ============================
// OBSERVAÇÕES DO PACIENTE NO ATENDIMENTO
// ============================
function renderAttendancePatientNotes(patient) {
    const el = document.getElementById('attendance-patient-notes');
    const box = document.getElementById('attendance-patient-notes-box');
    if (!el || !box) return;

    const flags = [];
    if (patient?.flags?.alergia) flags.push('Possui alergia');
    if (patient?.flags?.atencao) flags.push('Requer atenção especial');
    if (patient?.flags?.restricao) flags.push('Restrição medicamentosa');
    if (patient?.flags?.ansioso) flags.push('Sensível/ansioso em procedimento');

    const obs = (patient?.observacoes || '').trim();
    const parts = [];

    if (flags.length) parts.push('⚠️ ' + flags.join(' • '));
    if (obs) parts.push(obs);

    if (!parts.length) {
        el.innerText = 'Nenhuma observação cadastrada.';
        box.classList.add('hidden');
        return;
    }

    el.innerText = parts.join('\n\n');
    box.classList.remove('hidden');
}
