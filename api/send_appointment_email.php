<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';
require_auth();

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/db.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

header('Content-Type: application/json; charset=utf-8');

$config = require '/var/www/secure/mail_config.php';

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Não autenticado']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

$nome = trim((string)($data['nome'] ?? ''));
$email = trim((string)($data['email'] ?? ''));
$appointmentId = trim((string)($data['appointment_id'] ?? ''));
$groupId = trim((string)($data['appointment_group_id'] ?? ''));

$sessoes = $data['sessoes'] ?? [];

if ($nome === '' || $email === '' || $appointmentId === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Dados inválidos']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Email inválido']);
    exit;
}

// ===== TOKENS =====
$confirmToken = bin2hex(random_bytes(32));
$cancelToken = bin2hex(random_bytes(32));

$stmt = $conn->prepare("
    INSERT INTO appointment_actions
    (appointment_external_id, appointment_group_id, patient_email, action_token, action_type, expires_at)
    VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
");

if (!$stmt) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $conn->error]);
    exit;
}

// CONFIRM
$type = 'confirm';
$stmt->bind_param('sssss', $appointmentId, $groupId, $email, $confirmToken, $type);
$stmt->execute();

// CANCEL
$type = 'cancel';
$stmt->bind_param('sssss', $appointmentId, $groupId, $email, $cancelToken, $type);
$stmt->execute();

// ===== LINKS =====
$baseUrl = 'https://dralessandra.urqongroup.com.br/api';

$confirmLink = $baseUrl . '/confirm_appointment.php?token=' . urlencode($confirmToken);
$cancelLink = $baseUrl . '/cancel_appointment.php?token=' . urlencode($cancelToken);

// ===== MONTAR LISTA DE DATAS =====
$sessoesHtml = '';
$sessoesText = '';

if (!empty($sessoes)) {
    foreach ($sessoes as $s) {
        $dataBr = date('d/m/Y', strtotime($s['data']));
        $hora = $s['hora'];

        $sessoesHtml .= "<div style='padding:6px 0;'>📅 {$dataBr} às {$hora}</div>";
        $sessoesText .= "- {$dataBr} às {$hora}\n";
    }
} else {
    // fallback (1 sessão)
    $dataBr = date('d/m/Y', strtotime($data['data']));
    $hora = $data['hora'];

    $sessoesHtml = "<div>📅 {$dataBr} às {$hora}</div>";
    $sessoesText = "- {$dataBr} às {$hora}\n";
}

// ===== GOOGLE LINK (usa primeira sessão) =====
$first = $sessoes[0] ?? [
    'data' => $data['data'],
    'hora' => $data['hora']
];

$start = date('Ymd\THis', strtotime($first['data'] . ' ' . $first['hora']));
$end = date('Ymd\THis', strtotime($first['data'] . ' ' . $first['hora'] . ' +1 hour'));

$googleLink = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    . '&text=' . rawurlencode('Consulta MediCore - ' . $nome)
    . '&dates=' . $start . '/' . $end;

// ===== EMAIL HTML =====
$html = "
<html>
<body style='font-family:Arial;background:#f6f1f3;padding:20px'>
<div style='max-width:600px;margin:auto;background:#fff;border-radius:20px;overflow:hidden'>

<div style='background:#7b5238;color:#fff;padding:20px;text-align:center'>
<h2>MediCore</h2>
</div>

<div style='padding:30px'>
<h2>Olá, {$nome}</h2>

<p>Suas consultas foram agendadas:</p>

<div style='background:#fcf7f9;padding:15px;border-radius:10px'>
{$sessoesHtml}
</div>

<div style='margin-top:20px'>
<a href='{$confirmLink}' style='background:#22c55e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none'>Confirmar</a>
<a href='{$cancelLink}' style='background:#ef4444;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;margin-left:10px'>Cancelar</a>
</div>

<div style='margin-top:15px'>
<a href='{$googleLink}' style='background:#3b82f6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none'>Adicionar ao Google Agenda</a>
</div>

</div>
</div>
</body>
</html>
";

// ===== TEXTO =====
$altBody = "Olá {$nome}\n\nSuas consultas:\n{$sessoesText}\nConfirmar: {$confirmLink}\nCancelar: {$cancelLink}";

// ===== ENVIO =====
$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = $config['username'];
    $mail->Password = str_replace(' ', '', (string)$config['password']);
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = 587;
    $mail->CharSet = 'UTF-8';

    $mail->setFrom($config['from_email'], $config['from_name']);
    $mail->addAddress($email, $nome);

    $mail->isHTML(true);
    $mail->Subject = 'Confirmação de consultas';
    $mail->Body = $html;
    $mail->AltBody = $altBody;

    $mail->send();

    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    echo json_encode(['ok' => false, 'error' => $mail->ErrorInfo]);
}
