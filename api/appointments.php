<?php
require __DIR__ . '/_common.php';

ensure_table($conn, "CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  paciente_id VARCHAR(64) DEFAULT NULL,
  paciente_nome VARCHAR(255) DEFAULT NULL,
  group_id VARCHAR(64) DEFAULT NULL,
  data_consulta DATE DEFAULT NULL,
  hora_consulta TIME DEFAULT NULL,
  status VARCHAR(50) DEFAULT NULL,
  valor DECIMAL(12,2) DEFAULT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];

function call_google_calendar(array $payload): array {
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'ignore_errors' => true,
            'timeout' => 15
        ]
    ]);

    $result = @file_get_contents("http://localhost/api/google_calendar.php", false, $context);
    if ($result === false) {
        return ['ok' => false, 'error' => 'Falha ao conectar com google_calendar.php'];
    }

    $decoded = json_decode($result, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'error' => 'Resposta inválida do Google Calendar'];
    }

    return $decoded;
}

if ($method === 'GET') {
    $res = $conn->query("
        SELECT external_id, payload_json, google_event_id, google_event_link
        FROM appointments
        ORDER BY data_consulta DESC, hora_consulta DESC, id DESC
    ");

    respond_json(['ok' => true, 'items' => $res ? map_rows($res) : []]);
}

if ($method === 'POST') {
    $data = json_input();
    if (!$data) {
        respond_json(['ok' => false, 'error' => 'Payload vazio'], 400);
    }

    $externalId   = get_external_id($data);
    $payloadJson  = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $pacienteId   = $data['pacienteId'] ?? null;
    $pacienteNome = $data['pacienteNome'] ?? null;
    $groupId = $data['group_id'] ?? null;
    $dataConsulta = !empty($data['data']) ? date('Y-m-d', strtotime($data['data'])) : null;
    $horaConsulta = !empty($data['hora']) ? date('H:i:s', strtotime($data['hora'])) : null;
    $status       = $data['status'] ?? null;
    $valor        = isset($data['valor']) ? (float)$data['valor'] : null;

    // Verifica se já existe agendamento e se já tem evento Google
    $existingGoogleEventId = null;
    $existingGoogleEventLink = null;

    $check = $conn->prepare("SELECT google_event_id, google_event_link FROM appointments WHERE external_id = ? LIMIT 1");
    $check->bind_param('s', $externalId);
    $check->execute();
    $result = $check->get_result();
    if ($row = $result->fetch_assoc()) {
        $existingGoogleEventId = $row['google_event_id'] ?? null;
        $existingGoogleEventLink = $row['google_event_link'] ?? null;
    }

    // Salva/atualiza no banco primeiro
    $stmt = $conn->prepare("
        INSERT INTO appointments (
            external_id, paciente_id, paciente_nome, group_id, data_consulta, hora_consulta, status, valor, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            paciente_id = VALUES(paciente_id),
            paciente_nome = VALUES(paciente_nome),
            group_id = VALUES(group_id),
            data_consulta = VALUES(data_consulta),
            hora_consulta = VALUES(hora_consulta),
            status = VALUES(status),
            valor = VALUES(valor),
            payload_json = VALUES(payload_json)
    ");
    $stmt->bind_param(
        'sssssssds',
        $externalId,
        $pacienteId,
        $pacienteNome,
        $groupId,
        $dataConsulta,
        $horaConsulta,
        $status,
        $valor,
        $payloadJson
    );
    $stmt->execute();

    // Monta dados do evento
    $titulo = "Consulta - " . ($pacienteNome ?: 'Paciente');
    $descricao = "Paciente: " . ($pacienteNome ?: '-') . "\n"
        . "Data: " . ($dataConsulta ?: '-') . "\n"
        . "Hora: " . ($horaConsulta ?: '-') . "\n"
        . "Status: " . ($status ?: '-') . "\n"
        . "Valor: " . ($valor !== null ? number_format((float)$valor, 2, ',', '.') : '-') . "\n"
        . "Origem: MediCore";

    $inicio = null;
    $fim = null;

    if ($dataConsulta && $horaConsulta) {
        $inicio = $dataConsulta . 'T' . $horaConsulta;
        $fim = date('Y-m-d\TH:i:s', strtotime($inicio . ' +1 hour'));
    }

    $googleEventId = $existingGoogleEventId;
    $googleEventLink = $existingGoogleEventLink;
    $googleSync = null;

    if ($inicio && $fim) {
        if ($existingGoogleEventId) {
            $googleSync = call_google_calendar([
                'action' => 'update',
                'event_id' => $existingGoogleEventId,
                'titulo' => $titulo,
                'descricao' => $descricao,
                'inicio' => $inicio,
                'fim' => $fim
            ]);
        } else {
            $googleSync = call_google_calendar([
                'action' => 'create',
                'titulo' => $titulo,
                'descricao' => $descricao,
                'inicio' => $inicio,
                'fim' => $fim
            ]);

            if (!empty($googleSync['ok'])) {
                $googleEventId = $googleSync['event_id'] ?? null;
                $googleEventLink = $googleSync['link'] ?? null;

                $up = $conn->prepare("
                    UPDATE appointments
                    SET google_event_id = ?, google_event_link = ?
                    WHERE external_id = ?
                ");
                $up->bind_param('sss', $googleEventId, $googleEventLink, $externalId);
                $up->execute();
            }
        }
    }

    respond_json([
        'ok' => true,
        'id' => $externalId,
        'google_event_id' => $googleEventId,
        'google_event_link' => $googleEventLink,
        'google_sync' => $googleSync
    ]);
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') {
        respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);
    }

    // Busca o google_event_id antes de apagar
    $googleEventId = null;
    $stmtSel = $conn->prepare("SELECT google_event_id FROM appointments WHERE external_id = ? LIMIT 1");
    $stmtSel->bind_param('s', $id);
    $stmtSel->execute();
    $resSel = $stmtSel->get_result();
    if ($row = $resSel->fetch_assoc()) {
        $googleEventId = $row['google_event_id'] ?? null;
    }

    $googleSync = null;
    if ($googleEventId) {
        $googleSync = call_google_calendar([
            'action' => 'delete',
            'event_id' => $googleEventId
        ]);
    }

    $stmt = $conn->prepare("DELETE FROM appointments WHERE external_id = ?");
    $stmt->bind_param('s', $id);
    $stmt->execute();

    respond_json([
        'ok' => true,
        'google_sync' => $googleSync
    ]);
}

respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
