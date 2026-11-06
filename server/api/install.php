<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo '{"ok":false,"error":"仅允许命令行执行"}';
    exit;
}

require_once __DIR__ . '/_lib.php';

$force = in_array('--force', $argv, true);
$dataDir = gfic_data_dir();
$configPath = gfic_path('config.php');
$dataPath = gfic_path('data.json');

try {
    if (is_file($configPath) && !$force) {
        fwrite(STDERR, "错误：配置已存在，拒绝覆盖；如确需重新初始化，请使用 --force。\n");
        exit(1);
    }

    if (!is_dir($dataDir) && !@mkdir($dataDir, 0750, true)) {
        throw new RuntimeException('无法创建数据目录：' . $dataDir);
    }
    $backupDir = gfic_path('backups');
    if (!is_dir($backupDir) && !@mkdir($backupDir, 0750, true)) {
        throw new RuntimeException('无法创建备份目录：' . $backupDir);
    }

    $password = getenv('GFIC_ADMIN_PW');
    if ($password === false || $password === '') {
        $interactive = function_exists('stream_isatty') && @stream_isatty(STDIN);
        if (!$interactive) {
            throw new RuntimeException('非交互安装请通过 GFIC_ADMIN_PW 提供管理口令');
        }
        fwrite(STDOUT, '请输入管理口令（至少 12 位）：');
        $password = rtrim((string) fgets(STDIN), "\r\n");
    }
    if (strlen($password) < 12) {
        throw new RuntimeException('管理口令至少需要 12 位');
    }

    $exportToken = getenv('GFIC_EXPORT_TOKEN');
    if ($exportToken === false || $exportToken === '') {
        $exportToken = bin2hex(random_bytes(32));
    }

    $seed = getenv('GFIC_SEED');
    $initialData = null;
    if ($seed !== false && $seed !== '') {
        if (!is_file($seed) || !is_readable($seed)) {
            throw new RuntimeException('GFIC_SEED 指定的文件不存在或不可读');
        }
        $initialData = file_get_contents($seed);
        if ($initialData === false) {
            throw new RuntimeException('无法读取 GFIC_SEED 指定的文件');
        }
        if (strlen($initialData) > 5 * 1024 * 1024) {
            throw new RuntimeException('初始数据总大小不能超过 5 MB');
        }
        $decoded = json_decode($initialData);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('初始数据不是有效的 JSON');
        }
        $validationError = gfic_validate_data($decoded);
        if ($validationError !== null) {
            throw new RuntimeException('初始数据校验失败：' . $validationError);
        }
    } elseif (!is_file($dataPath)) {
        throw new RuntimeException('数据目录中无 data.json，请通过 GFIC_SEED 指定初始数据文件');
    }

    if ($initialData !== null) {
        gfic_atomic_write($dataPath, $initialData);
    }
    gfic_write_config(array(
        'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
        'exportToken' => $exportToken,
        'createdAt' => time(),
    ));
    gfic_atomic_write(gfic_path('sessions.json'), '{}');
    gfic_atomic_write(gfic_path('rate_limits.json'), '{}');

    fwrite(STDOUT, "初始化完成。\n数据目录：" . $dataDir . "\n");
    if ($initialData !== null) {
        fwrite(STDOUT, "已写入初始数据；备份目录已创建。\n");
    } else {
        fwrite(STDOUT, "已保留现有数据；备份目录已创建。\n");
    }
} catch (Throwable $error) {
    fwrite(STDERR, '错误：' . $error->getMessage() . "\n");
    exit(1);
}
