<?php
require __DIR__ . '/_common.php';
require __DIR__ . '/_points_engine.php';

$userTipo = $_SESSION['user_tipo'] ?? null;
if (!$userTipo || !in_array($userTipo, ['ADMIN', 'SECRETARIA'], true)) {
    club_respond(["ok" => false, "error" => "Acesso não autorizado"], 403);
}

$data = club_json_input();

$patientId = trim($data['patient_id'] ?? '');
$eventType = trim($data['event_type'] ?? '');
$referenciaId = trim($data['referencia_id'] ?? '');

if ($patientId === '') {
    club_respond(["ok" => false, "error" => "patient_id é obrigatório"], 400);
}

if ($eventType === '') {
    club_respond(["ok" => false, "error" => "event_type é obrigatório"], 400);
}

$clubUser = club_find_user_by_patient($conn, $patientId);

if (!$clubUser) {
    club_respond([
        "ok" => true,
        "message" => "Paciente não possui conta no clube ainda. Nenhuma pontuação aplicada."
    ]);
}

$ok = false;

switch ($eventType) {
    case 'consulta':
        club_points_consulta($conn, $patientId);
        $ok = true;
        break;

    case 'procedimento':
        club_points_procedimento($conn, $patientId);
        $ok = true;
        break;

    case 'plano':
        club_points_plano($conn, $patientId);
        $ok = true;
        break;

    default:
        club_respond(["ok" => false, "error" => "event_type inválido"], 400);
}

if (!$ok) {
    club_respond(["ok" => false, "error" => "Falha ao registrar pontuação"], 500);
}

club_respond([
    "ok" => true,
    "message" => "Pontuação aplicada com sucesso"
]);
