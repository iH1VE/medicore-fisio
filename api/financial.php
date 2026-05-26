<?php
require __DIR__ . '/_common.php';
require_role(['ADMIN']);

ensure_table($conn, "CREATE TABLE IF NOT EXISTS financial_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  entry_type VARCHAR(20) DEFAULT NULL,
  categoria VARCHAR(100) DEFAULT NULL,
  descricao VARCHAR(255) DEFAULT NULL,
  status VARCHAR(50) DEFAULT NULL,
  data_lancamento DATE DEFAULT NULL,
  valor DECIMAL(12,2) DEFAULT NULL,
  origem VARCHAR(100) DEFAULT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $res = $conn->query("SELECT external_id, payload_json FROM financial_entries ORDER BY data_lancamento DESC, id DESC");
    respond_json(['ok' => true, 'items' => $res ? map_rows($res) : []]);
}
if ($method === 'POST') {
    $data = json_input();
    if (!$data) respond_json(['ok' => false, 'error' => 'Payload vazio'], 400);
    $externalId = get_external_id($data);
    $payloadJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $entryType = $data['tipoLancamento'] ?? $data['tipo'] ?? null;
    $categoria = $data['categoria'] ?? null;
    $descricao = $data['descricao'] ?? $data['tipo'] ?? null;
    $status = $data['status'] ?? null;
    $dataLancamento = !empty($data['data']) ? date('Y-m-d', strtotime($data['data'])) : null;
    $valor = isset($data['valor']) ? (float)$data['valor'] : null;
    $origem = $data['origem'] ?? null;

    $stmt = $conn->prepare("INSERT INTO financial_entries (external_id, entry_type, categoria, descricao, status, data_lancamento, valor, origem, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE entry_type=VALUES(entry_type), categoria=VALUES(categoria), descricao=VALUES(descricao), status=VALUES(status), data_lancamento=VALUES(data_lancamento), valor=VALUES(valor), origem=VALUES(origem), payload_json=VALUES(payload_json)");
    $stmt->bind_param('ssssssdss', $externalId, $entryType, $categoria, $descricao, $status, $dataLancamento, $valor, $origem, $payloadJson);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $externalId]);
}
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);
    $stmt = $conn->prepare("DELETE FROM financial_entries WHERE external_id=?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}
respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
