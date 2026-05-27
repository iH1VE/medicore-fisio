<?php
session_start();
require __DIR__ . '/_common.php';
require_auth();

ensure_table($conn, "CREATE TABLE IF NOT EXISTS atendimentos (
  id VARCHAR(60) PRIMARY KEY,
  agendamento_id VARCHAR(60) DEFAULT '',
  paciente_id VARCHAR(60) NOT NULL DEFAULT '',
  data DATE,
  prescricao MEDIUMTEXT DEFAULT '[]',
  exames MEDIUMTEXT DEFAULT '[]',
  anamnese MEDIUMTEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_paciente (paciente_id),
  INDEX idx_data (data)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $where  = '1=1';
    $params = [];
    $types  = '';

    if (!empty($_GET['paciente_id'])) {
        $where   .= ' AND paciente_id = ?';
        $params[] = $_GET['paciente_id'];
        $types   .= 's';
    }

    $sql  = "SELECT id, agendamento_id, paciente_id, data, prescricao, exames, anamnese, created_at FROM atendimentos WHERE $where ORDER BY data DESC, created_at DESC LIMIT 500";
    $stmt = $conn->prepare($sql);
    if ($types) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res  = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['prescricao'] = json_decode($r['prescricao'] ?? '[]', true) ?? [];
        $r['exames']     = json_decode($r['exames']     ?? '[]', true) ?? [];
        $r['anamnese']   = json_decode($r['anamnese']   ?? '{}', true) ?? (object)[];
        $rows[] = $r;
    }
    respond_json(['ok' => true, 'items' => $rows]);
}

if ($method === 'POST') {
    $d   = json_input();
    $id  = trim((string)($d['id']             ?? ''));
    $aid = trim((string)($d['agendamentoId']  ?? $d['agendamento_id'] ?? ''));
    $pid = trim((string)($d['pacienteId']     ?? $d['paciente_id']   ?? ''));
    $dt  = trim((string)($d['data']           ?? ''));
    $pre = json_encode($d['prescricao'] ?? []);
    $exa = json_encode($d['exames']     ?? []);
    $ana = json_encode($d['anamnese']   ?? []);

    if (!$id) $id = uniqid('at_', true);

    $stmt = $conn->prepare("INSERT INTO atendimentos (id, agendamento_id, paciente_id, data, prescricao, exames, anamnese)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE agendamento_id=VALUES(agendamento_id), paciente_id=VALUES(paciente_id),
        data=VALUES(data), prescricao=VALUES(prescricao), exames=VALUES(exames), anamnese=VALUES(anamnese)");
    $stmt->bind_param('sssssss', $id, $aid, $pid, $dt, $pre, $exa, $ana);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $id]);
}

if ($method === 'DELETE') {
    $id   = trim((string)($_GET['id'] ?? ''));
    if (!$id) respond_json(['ok' => false, 'error' => 'id obrigatorio'], 400);
    $stmt = $conn->prepare("DELETE FROM atendimentos WHERE id = ?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Metodo nao permitido'], 405);
