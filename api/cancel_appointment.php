<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';
require_auth();

require __DIR__ . '/db.php';

header('Content-Type: text/html; charset=utf-8');

$token = trim((string)($_GET['token'] ?? ''));

if ($token === '') {
    http_response_code(400);
    echo '<h2>Token inválido.</h2>';
    exit;
}

$stmt = $conn->prepare("
    SELECT id, appointment_external_id, appointment_group_id, used_at, expires_at
    FROM appointment_actions
    WHERE action_token = ? AND action_type = 'cancel'
    LIMIT 1
");
$stmt->bind_param('s', $token);
$stmt->execute();
$res = $stmt->get_result();
$row = $res->fetch_assoc();

if (!$row) {
    http_response_code(404);
    echo '<h2>Token não encontrado.</h2>';
    exit;
}

if (!empty($row['used_at'])) {
    echo '<h2>Este link já foi utilizado.</h2>';
    exit;
}

if (strtotime((string)$row['expires_at']) < time()) {
    echo '<h2>Este link expirou.</h2>';
    exit;
}

$appointmentId = $row['appointment_external_id'];
$groupId = $row['appointment_group_id'] ?? null;

$updAction = $conn->prepare("UPDATE appointment_actions SET used_at = NOW() WHERE id = ?");
$updAction->bind_param('i', $row['id']);
$updAction->execute();

if (!empty($groupId)) {
    $sel = $conn->prepare("
        SELECT external_id, google_event_id, paciente_id, paciente_nome, data_consulta, hora_consulta
        FROM appointments
        WHERE group_id = ?
    ");
    $sel->bind_param('s', $groupId);
} else {
    $sel = $conn->prepare("
        SELECT external_id, google_event_id, paciente_id, paciente_nome, data_consulta, hora_consulta
        FROM appointments
        WHERE external_id = ?
    ");
    $sel->bind_param('s', $appointmentId);
}

$sel->execute();
$resAppts = $sel->get_result();

$updatedCount = 0;

while ($appt = $resAppts->fetch_assoc()) {
    $apptExternalId = $appt['external_id'];

    $selPayload = $conn->prepare("
        SELECT payload_json
        FROM appointments
        WHERE external_id = ?
        LIMIT 1
    ");
    $selPayload->bind_param('s', $apptExternalId);
    $selPayload->execute();
    $payloadRes = $selPayload->get_result();
    $payloadRow = $payloadRes->fetch_assoc();

    $payload = json_decode((string)($payloadRow['payload_json'] ?? '{}'), true);
    if (!is_array($payload)) $payload = [];
    $payload['status'] = 'Cancelado';
    $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $updAppt = $conn->prepare("
        UPDATE appointments
        SET status = 'Cancelado', payload_json = ?
        WHERE external_id = ?
    ");
    $updAppt->bind_param('ss', $payloadJson, $apptExternalId);
    $updAppt->execute();
    $updatedCount++;

    $log = $conn->prepare("
        INSERT INTO patient_logs (paciente_id, paciente_nome, appointment_external_id, group_id, acao, descricao)
        VALUES (?, ?, ?, ?, 'CANCELAMENTO_CONSULTA', ?)
    ");
    $descricaoLog = 'Consulta cancelada pelo paciente';
    $log->bind_param('sssss', $appt['paciente_id'], $appt['paciente_nome'], $apptExternalId, $groupId, $descricaoLog);
    $log->execute();

    if (!empty($appt['google_event_id'])) {
        $titulo = 'Consulta Cancelada - ' . ($appt['paciente_nome'] ?: 'Paciente');
        $descricao = "Paciente: " . ($appt['paciente_nome'] ?: '-') . "\n"
            . "Data: " . ($appt['data_consulta'] ?: '-') . "\n"
            . "Hora: " . ($appt['hora_consulta'] ?: '-') . "\n"
            . "Status: Cancelado\n"
            . "Origem: MediCore";

        $inicio = $appt['data_consulta'] . 'T' . $appt['hora_consulta'];
        $fim = date('Y-m-d\TH:i:s', strtotime($inicio . ' +1 hour'));

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\n",
                'content' => json_encode([
                    'action' => 'update',
                    'event_id' => $appt['google_event_id'],
                    'titulo' => $titulo,
                    'descricao' => $descricao,
                    'inicio' => $inicio,
                    'fim' => $fim
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'ignore_errors' => true,
                'timeout' => 15
            ]
        ]);

        @file_get_contents("http://localhost/api/google_calendar.php", false, $context);
    }
}

echo <<<HTML
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consulta cancelada</title>
</head>
<body style="margin:0;padding:0;background:#f6f1f3;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.08);">
        <div style="background:#7b5238;padding:28px 24px;text-align:center;color:#fff;">
            <img src="https://dralessandra.urqongroup.com.br/logo.png" alt="Logo" style="max-width:180px;width:100%;height:auto;display:block;margin:0 auto 12px auto;">
            <div style="font-size:28px;font-weight:bold;">MediCore</div>
        </div>
        <div style="padding:32px;">
            <h2 style="color:#7b5238;margin-top:0;">Consulta(s) cancelada(s)</h2>
            <p style="color:#4b5563;font-size:15px;line-height:1.7;">
                Total de sessões canceladas: <strong>{$updatedCount}</strong>.
            </p>
        </div>
    </div>
</body>
</html>
HTML;
