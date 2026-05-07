<?php
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/_referrals.php';

function club_add_points(
    mysqli $conn,
    int $clubUserId,
    string $patientId,
    int $pontos,
    string $origem,
    string $descricao = '',
    string $referenciaId = '',
    string $tipo = 'ganho'
): bool {

    if ($pontos <= 0) return false;

    $stmt = $conn->prepare("
        INSERT INTO club_points_log 
        (club_user_id, patient_id, tipo, pontos, origem, descricao, referencia_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");

    if (!$stmt) return false;

    $stmt->bind_param("ississs", $clubUserId, $patientId, $tipo, $pontos, $origem, $descricao, $referenciaId);
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) return false;

    if ($tipo === 'ganho' || $tipo === 'ajuste') {
        $stmt = $conn->prepare("
            UPDATE club_users
            SET pontos = pontos + ?, pontos_total = pontos_total + ?
            WHERE id = ?
        ");
        $stmt->bind_param("iii", $pontos, $pontos, $clubUserId);
        $stmt->execute();
        $stmt->close();
    }

    if ($tipo === 'gasto') {
        $stmt = $conn->prepare("
            UPDATE club_users
            SET pontos = GREATEST(0, pontos - ?)
            WHERE id = ?
        ");
        $stmt->bind_param("ii", $pontos, $clubUserId);
        $stmt->execute();
        $stmt->close();
    }

    // atualização de nível
    $stmt = $conn->prepare("SELECT pontos FROM club_users WHERE id = ?");
    $stmt->bind_param("i", $clubUserId);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    $p = (int)($row['pontos'] ?? 0);

    $nivel = 'Bronze';
    if ($p >= 10000) $nivel = 'Diamante';
    elseif ($p >= 5000) $nivel = 'Ouro';
    elseif ($p >= 2500) $nivel = 'Prata';

    $stmt = $conn->prepare("UPDATE club_users SET nivel = ? WHERE id = ?");
    $stmt->bind_param("si", $nivel, $clubUserId);
    $stmt->execute();
    $stmt->close();

    return true;
}

function club_find_user_by_patient(mysqli $conn, string $patientId): ?array {
    $stmt = $conn->prepare("SELECT id, patient_id FROM club_users WHERE patient_id = ? LIMIT 1");
    $stmt->bind_param("s", $patientId);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    return $row ?: null;
}

/*
====================================
REGRAS DE NEGÓCIO DE PONTOS
====================================
*/

function club_points_consulta(mysqli $conn, string $patientId): void {
    $user = club_find_user_by_patient($conn, $patientId);
    if (!$user) return;

    club_add_points(
        $conn,
        (int)$user['id'],
        $patientId,
        50,
        'consulta',
        'Consulta realizada'
    );

    club_process_referral_conversion($conn, (int)$user['id'], $patientId);
}

function club_points_procedimento(mysqli $conn, string $patientId): void {
    $user = club_find_user_by_patient($conn, $patientId);
    if (!$user) return;

    club_add_points(
        $conn,
        (int)$user['id'],
        $patientId,
        150,
        'procedimento',
        'Procedimento estético'
    );

    club_process_referral_conversion($conn, (int)$user['id'], $patientId);
}

function club_points_plano(mysqli $conn, string $patientId): void {
    $user = club_find_user_by_patient($conn, $patientId);
    if (!$user) return;

    club_add_points(
        $conn,
        (int)$user['id'],
        $patientId,
        300,
        'plano',
        'Plano mensal fechado'
    );

    club_process_referral_conversion($conn, (int)$user['id'], $patientId);
}
