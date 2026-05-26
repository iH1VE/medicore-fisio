<?php
require __DIR__ . '/_common.php';
require_auth();

ensure_table($conn, "CREATE TABLE IF NOT EXISTS protocols (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  nome VARCHAR(255) DEFAULT NULL,
  valor DECIMAL(12,2) DEFAULT NULL,
  duracao INT DEFAULT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $res = $conn->query("SELECT external_id, payload_json FROM protocols ORDER BY updated_at DESC, id DESC");
    respond_json(['ok' => true, 'items' => $res ? map_rows($res) : []]);
}
if ($method === 'POST') {
    $data = json_input();
    if (!$data) respond_json(['ok' => false, 'error' => 'Payload vazio'], 400);
    $externalId = get_external_id($data);
    $payloadJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $nome = $data['nome'] ?? null;
    $valor = isset($data['valor']) ? (float)$data['valor'] : null;
    $duracao = isset($data['duracao']) ? (int)$data['duracao'] : null;

    $stmt = $conn->prepare("INSERT INTO protocols (external_id, nome, valor, duracao, payload_json)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), valor=VALUES(valor), duracao=VALUES(duracao), payload_json=VALUES(payload_json)");
    $stmt->bind_param('ssdis', $externalId, $nome, $valor, $duracao, $payloadJson);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $externalId]);
}
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);
    $stmt = $conn->prepare("DELETE FROM protocols WHERE external_id=?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}
respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
