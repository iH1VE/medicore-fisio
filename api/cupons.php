<?php
session_start();
require __DIR__ . '/_common.php';
require_auth();

ensure_table($conn, "CREATE TABLE IF NOT EXISTS cupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  codigo VARCHAR(120) NOT NULL UNIQUE,
  tipo VARCHAR(30) NOT NULL,
  valor DECIMAL(12,2) NOT NULL DEFAULT 0,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

function require_admin(): void {
    $userTipo = $_SESSION['user_tipo'] ?? null;
    if ($userTipo !== 'ADMIN') {
        respond_json(['ok' => false, 'error' => 'Apenas administrador pode gerenciar cupons'], 403);
    }
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $res = $conn->query("SELECT external_id, payload_json FROM cupons ORDER BY updated_at DESC, id DESC");
    respond_json(['ok' => true, 'items' => $res ? map_rows($res) : []]);
}

if ($method === 'POST') {
    require_admin();

    $data = json_input();
    if (!$data) respond_json(['ok' => false, 'error' => 'Payload vazio'], 400);

    $externalId = get_external_id($data);
    $codigo = strtoupper(trim((string)($data['codigo'] ?? '')));
    $tipo = (string)($data['tipo'] ?? 'fixo');
    $valor = isset($data['valor']) ? (float)$data['valor'] : 0;
    $ativo = !empty($data['ativo']) ? 1 : 0;

    if ($codigo === '' || $valor <= 0) {
        respond_json(['ok' => false, 'error' => 'Código e valor do cupom são obrigatórios'], 400);
    }

    if (!in_array($tipo, ['percentual', 'fixo'], true)) {
        respond_json(['ok' => false, 'error' => 'Tipo de cupom inválido'], 400);
    }

    $data['id'] = $externalId;
    $data['codigo'] = $codigo;
    $data['tipo'] = $tipo;
    $data['valor'] = $valor;
    $data['ativo'] = (bool)$ativo;
    $payloadJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $existingId = null;
    $stmtCheck = $conn->prepare("SELECT external_id FROM cupons WHERE codigo = ? LIMIT 1");
    $stmtCheck->bind_param('s', $codigo);
    $stmtCheck->execute();
    $resCheck = $stmtCheck->get_result();
    if ($row = $resCheck->fetch_assoc()) {
        $existingId = $row['external_id'];
    }

    if ($existingId && $existingId !== $externalId) {
        $externalId = $existingId;
        $data['id'] = $externalId;
        $payloadJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    $stmt = $conn->prepare("INSERT INTO cupons (external_id, codigo, tipo, valor, ativo, payload_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE codigo=VALUES(codigo), tipo=VALUES(tipo), valor=VALUES(valor), ativo=VALUES(ativo), payload_json=VALUES(payload_json)");
    $stmt->bind_param('sssdis', $externalId, $codigo, $tipo, $valor, $ativo, $payloadJson);
    $stmt->execute();

    respond_json(['ok' => true, 'id' => $externalId]);
}

if ($method === 'DELETE') {
    require_admin();

    $id = $_GET['id'] ?? '';
    if ($id === '') respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);

    $stmt = $conn->prepare("DELETE FROM cupons WHERE external_id = ?");
    $stmt->bind_param('s', $id);
    $stmt->execute();

    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
