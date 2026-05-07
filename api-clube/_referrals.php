<?php

function club_referral_seed(string $text): string {
    $text = trim(mb_strtoupper($text, 'UTF-8'));
    $text = preg_replace('/[^A-Z0-9]/', '', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text));
    return substr($text ?: 'CLUBE', 0, 8);
}

function club_generate_unique_referral_code(mysqli $conn, string $seed = ''): string {
    $base = club_referral_seed($seed);
    if ($base === '') $base = 'CLUBE';

    for ($i = 0; $i < 30; $i++) {
        $code = $base . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);

        $stmt = $conn->prepare("SELECT id FROM club_users WHERE referral_code = ? LIMIT 1");
        $stmt->bind_param("s", $code);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res ? $res->fetch_assoc() : null;
        $stmt->close();

        if (!$exists) {
            return $code;
        }
    }

    return 'CLUBE' . strtoupper(substr(md5(uniqid('', true)), 0, 6));
}

function club_get_user_row(mysqli $conn, int $clubUserId): ?array {
    $stmt = $conn->prepare("
        SELECT id, patient_id, nome, email, telefone, pontos, pontos_total, nivel, status, referral_code
        FROM club_users
        WHERE id = ?
        LIMIT 1
    ");
    $stmt->bind_param("i", $clubUserId);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    return $row ?: null;
}

function club_ensure_user_referral_code(mysqli $conn, int $clubUserId): string {
    $user = club_get_user_row($conn, $clubUserId);
    if (!$user) return '';

    if (!empty($user['referral_code'])) {
        return $user['referral_code'];
    }

    $seed = $user['nome'] ?: ($user['email'] ?: 'CLUBE');
    $code = club_generate_unique_referral_code($conn, $seed);

    $stmt = $conn->prepare("UPDATE club_users SET referral_code = ? WHERE id = ?");
    $stmt->bind_param("si", $code, $clubUserId);
    $stmt->execute();
    $stmt->close();

    return $code;
}

function club_find_referrer_by_code(mysqli $conn, string $code): ?array {
    $code = trim(strtoupper($code));
    if ($code === '') return null;

    $stmt = $conn->prepare("
        SELECT id, patient_id, nome, email, telefone, referral_code
        FROM club_users
        WHERE referral_code = ?
        LIMIT 1
    ");
    $stmt->bind_param("s", $code);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    return $row ?: null;
}

function club_link_referral_for_user(mysqli $conn, int $clubUserId, string $patientId, string $referralCodeInput): array {
    $referralCodeInput = trim(strtoupper($referralCodeInput));

    $ownCode = club_ensure_user_referral_code($conn, $clubUserId);

    if ($referralCodeInput === '') {
        return [
            'ok' => true,
            'linked' => false,
            'referral_code' => $ownCode,
            'message' => 'Nenhum código de indicação informado.'
        ];
    }

    if ($referralCodeInput === $ownCode) {
        return [
            'ok' => false,
            'linked' => false,
            'referral_code' => $ownCode,
            'error' => 'Você não pode usar o próprio código.'
        ];
    }

    $stmt = $conn->prepare("SELECT id FROM club_referrals WHERE referred_club_user_id = ? LIMIT 1");
    $stmt->bind_param("i", $clubUserId);
    $stmt->execute();
    $res = $stmt->get_result();
    $existing = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    if ($existing) {
        return [
            'ok' => true,
            'linked' => false,
            'referral_code' => $ownCode,
            'message' => 'Esta conta já está vinculada a uma indicação.'
        ];
    }

    $referrer = club_find_referrer_by_code($conn, $referralCodeInput);
    if (!$referrer) {
        return [
            'ok' => false,
            'linked' => false,
            'referral_code' => $ownCode,
            'error' => 'Código de indicação inválido.'
        ];
    }

    if ((int)$referrer['id'] === $clubUserId) {
        return [
            'ok' => false,
            'linked' => false,
            'referral_code' => $ownCode,
            'error' => 'Você não pode usar o próprio código.'
        ];
    }

    $stmt = $conn->prepare("
        INSERT INTO club_referrals (
            referrer_club_user_id,
            referred_club_user_id,
            referred_patient_id,
            referral_code_used,
            status,
            bonus_referrer_points,
            bonus_referred_points
        ) VALUES (?, ?, ?, ?, 'cadastrado', 200, 50)
    ");
    $stmt->bind_param(
        "iiss",
        $referrer['id'],
        $clubUserId,
        $patientId,
        $referralCodeInput
    );
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        return [
            'ok' => false,
            'linked' => false,
            'referral_code' => $ownCode,
            'error' => 'Não foi possível vincular a indicação.'
        ];
    }

    return [
        'ok' => true,
        'linked' => true,
        'referral_code' => $ownCode,
        'message' => 'Indicação vinculada com sucesso.'
    ];
}

function club_process_referral_conversion(mysqli $conn, int $clubUserId, string $patientId): bool {
    $stmt = $conn->prepare("
        SELECT *
        FROM club_referrals
        WHERE referred_club_user_id = ?
          AND status = 'cadastrado'
        LIMIT 1
    ");
    $stmt->bind_param("i", $clubUserId);
    $stmt->execute();
    $res = $stmt->get_result();
    $ref = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    if (!$ref) return false;
    if (!function_exists('club_add_points')) return false;

    $conn->begin_transaction();

    try {
        $okReferrer = club_add_points(
            $conn,
            (int)$ref['referrer_club_user_id'],
            '',
            (int)$ref['bonus_referrer_points'],
            'indicacao',
            'Bônus por indicação convertida',
            (string)$ref['id'],
            'ganho'
        );

        $okReferred = club_add_points(
            $conn,
            (int)$ref['referred_club_user_id'],
            $patientId,
            (int)$ref['bonus_referred_points'],
            'indicacao',
            'Bônus de boas-vindas por indicação',
            (string)$ref['id'],
            'ganho'
        );

        if (!$okReferrer || !$okReferred) {
            throw new Exception('Falha ao lançar bônus de indicação');
        }

        $stmt = $conn->prepare("
            UPDATE club_referrals
            SET status = 'convertido',
                converted_at = NOW(),
                updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->bind_param("i", $ref['id']);
        $stmt->execute();
        $stmt->close();

        $conn->commit();
        return true;
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('Erro ao converter indicação: ' . $e->getMessage());
        return false;
    }
}

function club_get_referral_summary(mysqli $conn, int $clubUserId): array {
    $ownCode = club_ensure_user_referral_code($conn, $clubUserId);

    $stmt = $conn->prepare("
        SELECT
            COUNT(*) AS total_indicacoes,
            SUM(CASE WHEN status = 'convertido' THEN 1 ELSE 0 END) AS total_convertidos,
            SUM(CASE WHEN status = 'convertido' THEN bonus_referrer_points ELSE 0 END) AS total_bonus
        FROM club_referrals
        WHERE referrer_club_user_id = ?
    ");
    $stmt->bind_param("i", $clubUserId);
    $stmt->execute();
    $res = $stmt->get_result();
    $summary = $res ? $res->fetch_assoc() : [];
    $stmt->close();

    return [
        'referral_code' => $ownCode,
        'total_indicacoes' => (int)($summary['total_indicacoes'] ?? 0),
        'total_convertidos' => (int)($summary['total_convertidos'] ?? 0),
        'total_bonus' => (int)($summary['total_bonus'] ?? 0),
    ];
}
