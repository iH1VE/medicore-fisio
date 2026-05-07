<?php
require __DIR__ . '/_common.php';
require __DIR__ . '/_referrals.php';

mysqli_report(MYSQLI_REPORT_OFF);

function club_table_columns(mysqli $conn, string $table): array {
    $cols = [];
    $sql = "SHOW COLUMNS FROM `{$table}`";
    $res = $conn->query($sql);
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $cols[] = $row['Field'];
        }
    }
    return $cols;
}

$userTipo = $_SESSION['user_tipo'] ?? ($_SESSION['tipo'] ?? null);
if (!in_array($userTipo, ['ADMIN', 'SECRETARIA'], true)) {
    club_respond([
        "ok" => false,
        "error" => "Apenas administrador ou secretaria podem gerar acesso ao Clube"
    ], 403);
}

$data = club_json_input();

$patientId = trim((string)($data['patient_id'] ?? ''));
$patientNome = trim((string)($data['patient_nome'] ?? ''));
$patientEmail = trim((string)($data['patient_email'] ?? ''));
$patientTelefone = trim((string)($data['patient_telefone'] ?? ''));
$senhaTemporaria = trim((string)($data['temporary_password'] ?? ''));

if ($patientId === '' && $patientEmail === '' && $patientTelefone === '') {
    club_respond(["ok" => false, "error" => "Dados do paciente insuficientes"], 400);
}

if ($senhaTemporaria === '') {
    $senhaTemporaria = substr(str_shuffle('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'), 0, 10);
}

$patient = null;

if ($patientId !== '') {
    $stmt = $conn->prepare("
        SELECT id, external_id, nome, tel, email
        FROM patients
        WHERE external_id = ?
        LIMIT 1
    ");
    if ($stmt) {
        $stmt->bind_param("s", $patientId);
        $stmt->execute();
        $res = $stmt->get_result();
        $patient = $res ? $res->fetch_assoc() : null;
        $stmt->close();
    }

    if (!$patient && ctype_digit($patientId)) {
        $intId = (int)$patientId;
        $stmt = $conn->prepare("
            SELECT id, external_id, nome, tel, email
            FROM patients
            WHERE id = ?
            LIMIT 1
        ");
        if ($stmt) {
            $stmt->bind_param("i", $intId);
            $stmt->execute();
            $res = $stmt->get_result();
            $patient = $res ? $res->fetch_assoc() : null;
            $stmt->close();
        }
    }
}

if (!$patient && $patientEmail !== '') {
    $stmt = $conn->prepare("
        SELECT id, external_id, nome, tel, email
        FROM patients
        WHERE email = ?
        LIMIT 1
    ");
    if ($stmt) {
        $stmt->bind_param("s", $patientEmail);
        $stmt->execute();
        $res = $stmt->get_result();
        $patient = $res ? $res->fetch_assoc() : null;
        $stmt->close();
    }
}

if (!$patient && $patientTelefone !== '') {
    $stmt = $conn->prepare("
        SELECT id, external_id, nome, tel, email
        FROM patients
        WHERE tel = ?
        LIMIT 1
    ");
    if ($stmt) {
        $stmt->bind_param("s", $patientTelefone);
        $stmt->execute();
        $res = $stmt->get_result();
        $patient = $res ? $res->fetch_assoc() : null;
        $stmt->close();
    }
}

if (!$patient) {
    club_respond([
        "ok" => false,
        "error" => "Paciente não encontrado no MediCore"
    ], 404);
}

$clubPatientId = trim((string)($patient['external_id'] ?? ''));
if ($clubPatientId === '') {
    $clubPatientId = (string)$patient['id'];
}

$stmt = $conn->prepare("
    SELECT id, patient_id, nome, email
    FROM club_users
    WHERE patient_id = ?
    LIMIT 1
");
if (!$stmt) {
    club_respond([
        "ok" => false,
        "error" => "Erro ao preparar busca de club_users",
        "debug" => [
            "mysql_error" => $conn->error,
            "mysql_errno" => $conn->errno
        ]
    ], 500);
}
$stmt->bind_param("s", $clubPatientId);
$stmt->execute();
$res = $stmt->get_result();
$existing = $res ? $res->fetch_assoc() : null;
$stmt->close();

if ($existing) {
    $code = club_ensure_user_referral_code($conn, (int)$existing['id']);

    club_respond([
        "ok" => true,
        "already_exists" => true,
        "message" => "Este paciente já possui acesso ao Clube.",
        "club_user" => [
            "id" => (int)$existing['id'],
            "nome" => $existing['nome'],
            "email" => $existing['email'],
            "patient_id" => $existing['patient_id'],
            "referral_code" => $code
        ]
    ]);
}

$nome = trim((string)($patient['nome'] ?? $patientNome));
$email = trim((string)($patient['email'] ?? $patientEmail));
$telefone = trim((string)($patient['tel'] ?? $patientTelefone));
$hash = password_hash($senhaTemporaria, PASSWORD_DEFAULT);

$cols = club_table_columns($conn, 'club_users');

if (!$cols) {
    club_respond([
        "ok" => false,
        "error" => "Não foi possível ler a estrutura da tabela club_users"
    ], 500);
}

$insertData = [];

if (in_array('patient_id', $cols, true)) $insertData['patient_id'] = $clubPatientId;
if (in_array('nome', $cols, true)) $insertData['nome'] = $nome;
if (in_array('email', $cols, true)) $insertData['email'] = $email;

if (in_array('telefone', $cols, true)) {
    $insertData['telefone'] = $telefone;
} elseif (in_array('tel', $cols, true)) {
    $insertData['tel'] = $telefone;
}

if (in_array('senha_hash', $cols, true)) {
    $insertData['senha_hash'] = $hash;
} elseif (in_array('password_hash', $cols, true)) {
    $insertData['password_hash'] = $hash;
} elseif (in_array('password', $cols, true)) {
    $insertData['password'] = $hash;
}

if (in_array('pontos', $cols, true)) $insertData['pontos'] = 0;
if (in_array('pontos_total', $cols, true)) $insertData['pontos_total'] = 0;
if (in_array('nivel', $cols, true)) $insertData['nivel'] = 'Bronze';
if (in_array('status', $cols, true)) $insertData['status'] = 'ativo';

if (
    !isset($insertData['patient_id']) ||
    (
        !isset($insertData['senha_hash']) &&
        !isset($insertData['password_hash']) &&
        !isset($insertData['password'])
    )
) {
    club_respond([
        "ok" => false,
        "error" => "Estrutura de club_users incompatível com a criação de acesso",
        "debug" => [
            "columns" => $cols,
            "insertData" => $insertData
        ]
    ], 500);
}

$fields = array_keys($insertData);
$placeholders = implode(', ', array_fill(0, count($fields), '?'));
$fieldList = implode(', ', array_map(fn($f) => "`{$f}`", $fields));
$types = str_repeat('s', count($fields));
$values = array_map(fn($v) => (string)$v, array_values($insertData));

$sql = "INSERT INTO club_users ({$fieldList}) VALUES ({$placeholders})";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    club_respond([
        "ok" => false,
        "error" => "Erro ao preparar INSERT em club_users",
        "debug" => [
            "mysql_error" => $conn->error,
            "mysql_errno" => $conn->errno,
            "sql" => $sql,
            "columns" => $cols,
            "insertData" => $insertData
        ]
    ], 500);
}

$stmt->bind_param($types, ...$values);
$ok = $stmt->execute();
$newId = $stmt->insert_id;
$insertErr = $stmt->error;
$insertErrNo = $stmt->errno;
$stmt->close();

if (!$ok || !$newId) {
    club_respond([
        "ok" => false,
        "error" => "Não foi possível criar o acesso ao Clube",
        "debug" => [
            "mysql_error" => $insertErr ?: $conn->error,
            "mysql_errno" => $insertErrNo ?: $conn->errno,
            "sql" => $sql,
            "columns" => $cols,
            "insertData" => $insertData
        ]
    ], 500);
}

$referralCode = club_ensure_user_referral_code($conn, (int)$newId);

club_respond([
    "ok" => true,
    "already_exists" => false,
    "message" => "Acesso ao Clube criado com sucesso.",
    "temporary_password" => $senhaTemporaria,
    "club_user" => [
        "id" => (int)$newId,
        "nome" => $nome,
        "email" => $email,
        "telefone" => $telefone,
        "patient_id" => $clubPatientId,
        "referral_code" => $referralCode
    ]
]);
