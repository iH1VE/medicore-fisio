<?php
require __DIR__ . '/_common.php';

$userTipo = $_SESSION['user_tipo'] ?? null;
if ($userTipo !== 'ADMIN') {
    club_respond(["ok" => false, "error" => "Apenas administrador pode gerenciar recompensas"], 403);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $res = $conn->query("SELECT * FROM club_rewards ORDER BY ativo DESC, pontos ASC, id DESC");
    $items = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $items[] = $row;
        }
    }

    club_respond([
        "ok" => true,
        "items" => $items
    ]);
}

if ($method === 'POST') {
    $data = club_json_input();

    $id = isset($data['id']) ? (int)$data['id'] : 0;
    $nome = trim($data['nome'] ?? '');
    $descricao = trim($data['descricao'] ?? '');
    $pontos = (int)($data['pontos'] ?? 0);
    $tipo = trim($data['tipo'] ?? 'desconto');
    $estoque = ($data['estoque'] === '' || !isset($data['estoque'])) ? null : (int)$data['estoque'];
    $ativo = !empty($data['ativo']) ? 1 : 0;

    if ($nome === '' || $pontos <= 0 || $tipo === '') {
        club_respond(["ok" => false, "error" => "Nome, pontos e tipo são obrigatórios"], 400);
    }

    if ($id > 0) {
        $stmt = $conn->prepare("
            UPDATE club_rewards
            SET nome = ?, descricao = ?, pontos = ?, tipo = ?, estoque = ?, ativo = ?
            WHERE id = ?
        ");
        $stmt->bind_param("ssisiii", $nome, $descricao, $pontos, $tipo, $estoque, $ativo, $id);
        $ok = $stmt->execute();
        $stmt->close();

        if (!$ok) {
            club_respond(["ok" => false, "error" => "Erro ao atualizar recompensa"], 500);
        }

        club_respond(["ok" => true, "message" => "Recompensa atualizada com sucesso"]);
    }

    $stmt = $conn->prepare("
        INSERT INTO club_rewards (nome, descricao, pontos, tipo, estoque, ativo)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->bind_param("ssisii", $nome, $descricao, $pontos, $tipo, $estoque, $ativo);
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        club_respond(["ok" => false, "error" => "Erro ao criar recompensa"], 500);
    }

    club_respond(["ok" => true, "message" => "Recompensa criada com sucesso"]);
}

if ($method === 'DELETE') {
    parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
    $id = isset($qs['id']) ? (int)$qs['id'] : 0;

    if ($id <= 0) {
        club_respond(["ok" => false, "error" => "ID inválido"], 400);
    }

    $stmt = $conn->prepare("DELETE FROM club_rewards WHERE id = ?");
    $stmt->bind_param("i", $id);
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        club_respond(["ok" => false, "error" => "Erro ao excluir recompensa"], 500);
    }

    club_respond(["ok" => true, "message" => "Recompensa excluída com sucesso"]);
}

club_respond(["ok" => false, "error" => "Método não permitido"], 405);
