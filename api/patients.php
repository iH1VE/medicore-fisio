<?php
require __DIR__ . '/_common.php';
require_auth();

ensure_table($conn, "CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  nome VARCHAR(255) DEFAULT NULL,
  cpf VARCHAR(50) DEFAULT NULL,
  tel VARCHAR(50) DEFAULT NULL,
  email VARCHAR(255) DEFAULT NULL,
  tipo_atendimento VARCHAR(100) DEFAULT NULL,
  data_cadastro DATETIME DEFAULT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $res = $conn->query("SELECT external_id, payload_json FROM patients ORDER BY updated_at DESC, id DESC");
    respond_json(['ok' => true, 'items' => $res ? map_rows($res) : []]);
}

if ($method === 'POST') {
    $data = json_input();
    if (!$data) respond_json(['ok' => false, 'error' => 'Payload vazio'], 400);
    $externalId = get_external_id($data);
    $payloadJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $nome = $data['nome'] ?? null;
    $cpf = $data['cpf'] ?? null;
    $tel = $data['tel'] ?? null;
    $email = $data['email'] ?? null;
    $tipo = $data['tipoAtendimento'] ?? null;
    $cadastro = !empty($data['dataCadastro']) ? date('Y-m-d H:i:s', strtotime($data['dataCadastro'])) : null;

    $stmt = $conn->prepare("INSERT INTO patients (external_id, nome, cpf, tel, email, tipo_atendimento, data_cadastro, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), cpf=VALUES(cpf), tel=VALUES(tel), email=VALUES(email), tipo_atendimento=VALUES(tipo_atendimento), data_cadastro=VALUES(data_cadastro), payload_json=VALUES(payload_json)");
    $stmt->bind_param('ssssssss', $externalId, $nome, $cpf, $tel, $email, $tipo, $cadastro, $payloadJson);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $externalId]);
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);
    $stmt = $conn->prepare("DELETE FROM patients WHERE external_id=?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
