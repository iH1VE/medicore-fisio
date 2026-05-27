<?php
session_start();
require __DIR__ . '/_common.php';
require_role(['ADMIN']);

ensure_table($conn, "CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  acao VARCHAR(60) NOT NULL,
  entidade VARCHAR(80) NOT NULL DEFAULT '',
  detalhes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_usuario (usuario),
  INDEX idx_acao (acao)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $limit  = min((int)($_GET['limit'] ?? 200), 500);
    $offset = (int)($_GET['offset'] ?? 0);

    $where  = '1=1';
    $params = [];
    $types  = '';

    if (!empty($_GET['usuario'])) {
        $where .= ' AND usuario LIKE ?';
        $params[] = '%' . $_GET['usuario'] . '%';
        $types .= 's';
    }
    if (!empty($_GET['acao'])) {
        $where .= ' AND acao = ?';
        $params[] = $_GET['acao'];
        $types .= 's';
    }
    if (!empty($_GET['inicio'])) {
        $where .= ' AND DATE(created_at) >= ?';
        $params[] = $_GET['inicio'];
        $types .= 's';
    }
    if (!empty($_GET['fim'])) {
        $where .= ' AND DATE(created_at) <= ?';
        $params[] = $_GET['fim'];
        $types .= 's';
    }

    $sql  = "SELECT id, usuario, acao, entidade, detalhes, created_at FROM audit_logs WHERE $where ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $stmt = $conn->prepare($sql);

    $params[] = $limit;
    $params[] = $offset;
    $types   .= 'ii';

    if ($types) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $res  = $stmt->get_result();
    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $row['id'] = (int)$row['id'];
        $rows[]    = $row;
    }
    respond_json(['ok' => true, 'items' => $rows]);
}

if ($method === 'POST') {
    $data     = json_input();
    $usuario  = substr(trim((string)($data['usuario']  ?? 'Sistema')), 0, 120);
    $acao     = substr(trim((string)($data['acao']     ?? 'Ação')),    0, 60);
    $entidade = substr(trim((string)($data['entidade'] ?? '')),        0, 80);
    $detalhes = substr(trim((string)($data['detalhes'] ?? '')),        0, 1000);

    $stmt = $conn->prepare("INSERT INTO audit_logs (usuario, acao, entidade, detalhes) VALUES (?, ?, ?, ?)");
    $stmt->bind_param('ssss', $usuario, $acao, $entidade, $detalhes);
    $stmt->execute();
    $insertId = $conn->insert_id;

    respond_json(['ok' => true, 'id' => $insertId]);
}

respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
