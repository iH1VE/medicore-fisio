<?php
require __DIR__ . '/_common.php';

$data = club_json_input();

$nome = trim($data['nome'] ?? '');
$email = trim($data['email'] ?? '');
$telefone = trim($data['telefone'] ?? '');
$senha = (string)($data['senha'] ?? '');
$referralCode = trim($data['referral_code'] ?? '');

if ($nome === '' || $email === '' || $senha === '') {
    club_respond(["ok" => false, "error" => "Nome, e-mail e senha são obrigatórios"], 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    club_respond(["ok" => false, "error" => "E-mail inválido"], 400);
}

if (strlen($senha) < 6) {
    club_respond(["ok" => false, "error" => "A senha deve ter pelo menos 6 caracteres"], 400);
}

$stmt = $conn->prepare("SELECT id FROM club_users WHERE email = ? LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$res = $stmt->get_result();
$existing = $res ? $res->fetch_assoc() : null;
$stmt->close();

if ($existing) {
    club_respond(["ok" => false, "error" => "Já existe uma conta com este e-mail"], 409);
}

$patient = club_get_patient_by_email($conn, $email);

if ($patient) {
    $patientId = $patient['external_id'] ?? $patient['id'] ?? '';
} else {
    $patientId = club_create_patient($conn, $nome, $email, $telefone);
}

if ($patientId === '') {
    club_respond(["ok" => false, "error" => "Não foi possível vincular o paciente"], 500);
}

$senhaHash = password_hash($senha, PASSWORD_DEFAULT);

// Gera código de indicação único para este usuário (ex: MARIA2B3F)
$nomeBase = strtoupper(preg_replace('/[^A-Za-z]/i', '', $nome));
$nomeBase = substr($nomeBase, 0, 5);
$myReferralCode = $nomeBase . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));

// Garante unicidade
$tentativas = 0;
do {
    $stmtCheck = $conn->prepare("SELECT id FROM club_users WHERE referral_code = ? LIMIT 1");
    $stmtCheck->bind_param("s", $myReferralCode);
    $stmtCheck->execute();
    $exists = $stmtCheck->get_result()->fetch_assoc();
    $stmtCheck->close();
    if ($exists) {
        $myReferralCode = $nomeBase . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
    }
    $tentativas++;
} while ($exists && $tentativas < 10);

$stmt = $conn->prepare("
    INSERT INTO club_users (
        patient_id, nome, email, telefone, senha_hash, referral_code,
        pontos, pontos_total, nivel, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'Bronze', 'ativo', NOW(), NOW())
");

$stmt->bind_param("ssssss", $patientId, $nome, $email, $telefone, $senhaHash, $myReferralCode);
$ok = $stmt->execute();
$clubUserId = $stmt->insert_id;
$stmt->close();

if (!$ok) {
    club_respond(["ok" => false, "error" => "Erro ao criar conta do clube"], 500);
}

$_SESSION['club_user'] = [
    "id" => $clubUserId,
    "patient_id" => $patientId,
    "nome" => $nome,
    "email" => $email,
    "telefone" => $telefone,
    "pontos" => 0,
    "pontos_total" => 0,
    "nivel" => "Bronze",
    "status" => "ativo"
];

club_respond([
    "ok" => true,
    "user" => $_SESSION['club_user']
]);
