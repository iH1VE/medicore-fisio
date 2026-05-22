<?php
session_start();
require __DIR__ . '/_common.php';

ensure_table($conn, "CREATE TABLE IF NOT EXISTS avaliacoes (
  id VARCHAR(60) PRIMARY KEY,
  paciente_id VARCHAR(60) NOT NULL DEFAULT '',
  timestamp DATETIME,
  perguntas MEDIUMTEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_paciente (paciente_id)
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

    $sql  = "SELECT id, paciente_id, timestamp, perguntas, notes, created_at FROM avaliacoes WHERE $where ORDER BY timestamp DESC, created_at DESC LIMIT 500";
    $stmt = $conn->prepare($sql);
    if ($types) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res  = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['perguntas'] = json_decode($r['perguntas'] ?? '[]', true) ?? [];
        $rows[] = $r;
    }
    respond_json(['ok' => true, 'items' => $rows]);
}

if ($method === 'POST') {
    $d   = json_input();
    $id  = trim((string)($d['id']         ?? ''));
    $pid = trim((string)($d['pacienteId'] ?? $d['paciente_id'] ?? ''));
    $ts  = trim((string)($d['timestamp']  ?? date('Y-m-d H:i:s')));
    $per = json_encode($d['perguntas'] ?? []);
    $not = substr(trim((string)($d['notes'] ?? '')), 0, 5000);

    if (!$id) $id = uniqid('av_', true);

    $stmt = $conn->prepare("INSERT INTO avaliacoes (id, paciente_id, timestamp, perguntas, notes)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE paciente_id=VALUES(paciente_id),
        timestamp=VALUES(timestamp), perguntas=VALUES(perguntas), notes=VALUES(notes)");
    $stmt->bind_param('sssss', $id, $pid, $ts, $per, $not);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $id]);
}

if ($method === 'DELETE') {
    $id   = trim((string)($_GET['id'] ?? ''));
    if (!$id) respond_json(['ok' => false, 'error' => 'id obrigatorio'], 400);
    $stmt = $conn->prepare("DELETE FROM avaliacoes WHERE id = ?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Metodo nao permitido'], 405);
