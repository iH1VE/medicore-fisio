<?php
require __DIR__ . '/db.php';

function require_auth(): void {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Não autenticado'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function require_role(array $roles): void {
    require_auth();
    $tipo = strtoupper($_SESSION['user_tipo'] ?? '');
    if (!in_array($tipo, array_map('strtoupper', $roles), true)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Acesso não autorizado'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respond_json($payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ensure_table(mysqli $conn, string $sql): void {
    if (!$conn->query($sql)) {
        respond_json(['ok' => false, 'error' => 'Falha ao preparar tabela: ' . $conn->error], 500);
    }
}

function get_external_id(array $data): string {
    return (string)($data['id'] ?? $data['external_id'] ?? uniqid('', true));
}

function map_rows(mysqli_result $result): array {
    $items = [];
    while ($row = $result->fetch_assoc()) {
        $decoded = [];
        if (!empty($row['payload_json'])) {
            $decoded = json_decode($row['payload_json'], true);
            if (!is_array($decoded)) $decoded = [];
        }
        $decoded['id'] = $row['external_id'];
        $items[] = $decoded;
    }
    return $items;
}
