<?php
require __DIR__ . '/_common.php';

ensure_table($conn, "CREATE TABLE IF NOT EXISTS stock_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  nome VARCHAR(255) DEFAULT NULL,
  lote VARCHAR(100) DEFAULT NULL,
  validade DATE DEFAULT NULL,
  qtd INT DEFAULT NULL,
  custo DECIMAL(12,2) DEFAULT NULL,
  preco DECIMAL(12,2) DEFAULT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $res = $conn->query("SELECT external_id, payload_json FROM stock_items ORDER BY updated_at DESC, id DESC");
    respond_json(['ok' => true, 'items' => $res ? map_rows($res) : []]);
}
if ($method === 'POST') {
    $data = json_input();
    if (!$data) respond_json(['ok' => false, 'error' => 'Payload vazio'], 400);
    $externalId = get_external_id($data);
    $payloadJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $nome = $data['nome'] ?? null;
    $lote = $data['lote'] ?? null;
    $validade = !empty($data['validade']) ? date('Y-m-d', strtotime($data['validade'])) : null;
    $qtd = isset($data['qtd']) ? (int)$data['qtd'] : null;
    $custo = isset($data['custo']) ? (float)$data['custo'] : null;
    $preco = isset($data['preco']) ? (float)$data['preco'] : null;

    $stmt = $conn->prepare("INSERT INTO stock_items (external_id, nome, lote, validade, qtd, custo, preco, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), lote=VALUES(lote), validade=VALUES(validade), qtd=VALUES(qtd), custo=VALUES(custo), preco=VALUES(preco), payload_json=VALUES(payload_json)");
    $stmt->bind_param('ssssidss', $externalId, $nome, $lote, $validade, $qtd, $custo, $preco, $payloadJson);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $externalId]);
}
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);
    $stmt = $conn->prepare("DELETE FROM stock_items WHERE external_id=?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}
respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
