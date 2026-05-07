<?php
session_start();
header("Content-Type: application/json; charset=utf-8");

require_once __DIR__ . '/../api/db.php';

function club_json_input(): array {
    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function club_respond(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function club_generate_id(string $prefix = 'club'): string {
    return $prefix . '_' . bin2hex(random_bytes(8));
}

function club_get_patient_by_email(mysqli $conn, string $email): ?array {
    $stmt = $conn->prepare("SELECT * FROM patients WHERE email = ? LIMIT 1");
    if (!$stmt) return null;

    $stmt->bind_param("s", $email);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    return $row ?: null;
}

function club_create_patient(mysqli $conn, string $nome, string $email, string $telefone = ''): string {
    $patientId = club_generate_id('pac');

    $payload = [
        "id" => $patientId,
        "nome" => $nome,
        "cpf" => "",
        "tel" => $telefone,
        "email" => $email,
        "tipoAtendimento" => "Clube",
        "dataCadastro" => date("Y-m-d H:i:s"),
        "protocolosContratados" => [],
        "origemCadastro" => "clube"
    ];

    $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $cpf = "";
    $tipoAtendimento = "Clube";
    $dataCadastro = date("Y-m-d H:i:s");

    $sql = "INSERT INTO patients (
                external_id,
                nome,
                cpf,
                tel,
                email,
                tipo_atendimento,
                data_cadastro,
                payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        club_respond([
            "ok" => false,
            "error" => "Não foi possível preparar criação do paciente",
            "mysql_error" => $conn->error
        ], 500);
    }

    $stmt->bind_param(
        "ssssssss",
        $patientId,
        $nome,
        $cpf,
        $telefone,
        $email,
        $tipoAtendimento,
        $dataCadastro,
        $payloadJson
    );

    $ok = $stmt->execute();
    $mysqlStmtError = $stmt->error;
    $stmt->close();

    if (!$ok) {
        club_respond([
            "ok" => false,
            "error" => "Erro ao criar paciente no MediCore",
            "mysql_error" => $mysqlStmtError
        ], 500);
    }

    return $patientId;
}

function club_require_auth(): array {
    if (empty($_SESSION['club_user'])) {
        club_respond(["ok" => false, "error" => "Não autenticado"], 401);
    }

    return $_SESSION['club_user'];
}
