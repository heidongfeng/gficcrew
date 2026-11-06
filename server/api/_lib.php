<?php

if (basename(isset($_SERVER['SCRIPT_FILENAME']) ? $_SERVER['SCRIPT_FILENAME'] : '') === basename(__FILE__)) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo '{"ok":false,"error":"未找到"}';
    exit;
}

function gfic_data_dir()
{
    static $dir = null;
    if ($dir === null) {
        $dir = getenv('GFIC_DATA_DIR');
        if ($dir === false || trim($dir) === '') {
            $dir = '/www/gfic-data';
        }
        $dir = rtrim($dir, '/\\');
        if ($dir === '') {
            $dir = DIRECTORY_SEPARATOR;
        }
    }
    return $dir;
}

function gfic_path($name)
{
    $dir = gfic_data_dir();
    return ($dir === DIRECTORY_SEPARATOR ? '' : $dir) . DIRECTORY_SEPARATOR . $name;
}

function gfic_collections()
{
    return array('site', 'contact', 'cities', 'events', 'faq', 'plans', 'guides');
}

function gfic_json_headers()
{
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
}

function gfic_json($payload, $status = 200)
{
    http_response_code($status);
    gfic_json_headers();
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        $json = '{"ok":false,"error":"响应编码失败"}';
        http_response_code(500);
    }
    echo $json;
    exit;
}

function gfic_error($status, $message, $extra = array())
{
    gfic_json(array_merge(array('ok' => false, 'error' => $message), $extra), $status);
}

function gfic_require_method($method)
{
    if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        gfic_error(405, '请求方法不允许');
    }
}

function gfic_read_json_body($maxBytes = 65536, &$rawBody = null)
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        gfic_error(400, '请求体必须是有效的 JSON');
    }
    if ($maxBytes !== null && strlen($raw) > $maxBytes) {
        gfic_error(400, '数据总大小不能超过 5 MB');
    }
    $body = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($body)) {
        gfic_error(400, '请求体必须是有效的 JSON 对象');
    }
    $rawBody = $raw;
    return $body;
}

function gfic_validate_data($data)
{
    if ($data instanceof stdClass) {
        $data = get_object_vars($data);
    }
    if (!is_array($data) || count($data) !== 7) {
        return '数据必须恰好包含 7 个集合';
    }
    foreach (gfic_collections() as $collection) {
        if (!array_key_exists($collection, $data) || !is_array($data[$collection])) {
            return '集合 ' . $collection . ' 缺失或不是数组';
        }
    }
    return null;
}

function gfic_encode_json($value)
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('JSON 编码失败');
    }
    return $json;
}

function gfic_acquire_lock($path, $exclusive)
{
    $handle = @fopen($path . '.lock', 'c');
    if ($handle === false) {
        throw new RuntimeException('无法打开锁文件');
    }
    $operation = $exclusive ? LOCK_EX : LOCK_SH;
    if (!@flock($handle, $operation)) {
        fclose($handle);
        throw new RuntimeException('无法获取文件锁');
    }
    return $handle;
}

function gfic_release_lock($handle)
{
    flock($handle, LOCK_UN);
    fclose($handle);
}

function gfic_read_file($path)
{
    $lock = gfic_acquire_lock($path, false);
    try {
        if (!is_file($path)) {
            return null;
        }
        $contents = @file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException('无法读取文件');
        }
        return $contents;
    } finally {
        gfic_release_lock($lock);
    }
}

function gfic_read_json_unlocked($path, $default)
{
    if (!is_file($path)) {
        return $default;
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('无法读取 JSON 文件');
    }
    $value = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('JSON 文件格式错误');
    }
    return $value;
}

function gfic_read_json_file($path, $default)
{
    $raw = gfic_read_file($path);
    if ($raw === null) {
        return $default;
    }
    $value = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('JSON 文件格式错误');
    }
    return $value;
}

function gfic_write_all($handle, $contents)
{
    $length = strlen($contents);
    $offset = 0;
    while ($offset < $length) {
        $written = @fwrite($handle, substr($contents, $offset));
        if ($written === false || $written === 0) {
            throw new RuntimeException('无法写入文件');
        }
        $offset += $written;
    }
}

function gfic_atomic_write_unlocked($path, $contents)
{
    $directory = dirname($path);
    $temporary = @tempnam($directory, '.tmp-');
    if ($temporary === false) {
        throw new RuntimeException('无法创建临时文件');
    }
    $handle = null;
    try {
        $handle = @fopen($temporary, 'wb');
        if ($handle === false) {
            throw new RuntimeException('无法打开临时文件');
        }
        gfic_write_all($handle, $contents);
        if (!@fflush($handle)) {
            throw new RuntimeException('无法刷新临时文件');
        }
        fclose($handle);
        $handle = null;
        @chmod($temporary, 0640);
        if (!@rename($temporary, $path)) {
            throw new RuntimeException('无法替换目标文件');
        }
        $temporary = null;
    } catch (Throwable $error) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        if ($temporary !== null && is_file($temporary)) {
            @unlink($temporary);
        }
        throw $error;
    }
}

function gfic_atomic_write($path, $contents, $beforeWrite = null)
{
    $lock = gfic_acquire_lock($path, true);
    try {
        if ($beforeWrite !== null) {
            call_user_func($beforeWrite);
        }
        gfic_atomic_write_unlocked($path, $contents);
    } finally {
        gfic_release_lock($lock);
    }
}

function gfic_write_exclusive_file($path, $contents)
{
    $handle = @fopen($path, 'c+b');
    if ($handle === false) {
        throw new RuntimeException('无法打开写入文件');
    }
    try {
        if (!@flock($handle, LOCK_EX)) {
            throw new RuntimeException('无法获取写入锁');
        }
        if (!@ftruncate($handle, 0) || !@rewind($handle)) {
            throw new RuntimeException('无法准备写入文件');
        }
        gfic_write_all($handle, $contents);
        if (!@fflush($handle)) {
            throw new RuntimeException('无法刷新写入文件');
        }
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }
}

function gfic_load_config()
{
    $path = gfic_path('config.php');
    if (!is_file($path) || !is_readable($path)) {
        throw new RuntimeException('服务未初始化');
    }
    $lock = gfic_acquire_lock($path, false);
    try {
        $config = include $path;
        if (!is_array($config) || empty($config['passwordHash']) || empty($config['exportToken'])) {
            throw new RuntimeException('配置文件格式错误');
        }
        return $config;
    } finally {
        gfic_release_lock($lock);
    }
}

function gfic_write_config($config)
{
    $contents = "<?php\nreturn " . var_export($config, true) . ";\n";
    gfic_atomic_write(gfic_path('config.php'), $contents);
}

function gfic_bearer_token()
{
    $authorization = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authorization = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authorization = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                $authorization = $value;
                break;
            }
        }
    }
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim($authorization), $matches) !== 1) {
        return null;
    }
    return strtolower($matches[1]);
}

function gfic_clean_sessions($sessions)
{
    if (!is_array($sessions)) {
        return array();
    }
    $now = time();
    foreach ($sessions as $token => $session) {
        if (!is_array($session) || !isset($session['expires']) || !is_numeric($session['expires']) || (int) $session['expires'] <= $now) {
            unset($sessions[$token]);
        }
    }
    return $sessions;
}

function gfic_cleanup_sessions()
{
    $path = gfic_path('sessions.json');
    $lock = gfic_acquire_lock($path, true);
    try {
        $sessions = gfic_read_json_unlocked($path, array());
        $clean = gfic_clean_sessions($sessions);
        if ($clean !== $sessions) {
            gfic_atomic_write_unlocked($path, gfic_encode_json($clean));
        }
    } finally {
        gfic_release_lock($lock);
    }
}

function gfic_read_sessions()
{
    $sessions = gfic_read_json_file(gfic_path('sessions.json'), array());
    $clean = gfic_clean_sessions($sessions);
    if ($clean !== $sessions) {
        gfic_cleanup_sessions();
    }
    return $clean;
}

function gfic_create_session()
{
    $path = gfic_path('sessions.json');
    $lock = gfic_acquire_lock($path, true);
    try {
        $sessions = gfic_clean_sessions(gfic_read_json_unlocked($path, array()));
        $token = bin2hex(random_bytes(32));
        $sessions[$token] = array('expires' => time() + 7200);
        gfic_atomic_write_unlocked($path, gfic_encode_json($sessions));
        return $token;
    } finally {
        gfic_release_lock($lock);
    }
}

function gfic_revoke_sessions()
{
    gfic_atomic_write(gfic_path('sessions.json'), '{}');
}

function gfic_verify_token($token)
{
    if ($token === null) {
        return false;
    }
    $sessions = gfic_read_sessions();
    return isset($sessions[$token]['expires']) && (int) $sessions[$token]['expires'] > time();
}

function gfic_require_auth()
{
    if (!gfic_verify_token(gfic_bearer_token())) {
        gfic_error(401, '未授权');
    }
}

function gfic_client_ip()
{
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
}

function gfic_login_lock_remaining($ip)
{
    $records = gfic_read_json_file(gfic_path('rate_limits.json'), array());
    if (!is_array($records) || !isset($records[$ip]['lockedUntil'])) {
        return 0;
    }
    return max(0, (int) $records[$ip]['lockedUntil'] - time());
}

function gfic_register_login_failure($ip)
{
    $path = gfic_path('rate_limits.json');
    $lock = gfic_acquire_lock($path, true);
    try {
        $records = gfic_read_json_unlocked($path, array());
        if (!is_array($records)) {
            $records = array();
        }
        $now = time();
        $record = isset($records[$ip]) && is_array($records[$ip]) ? $records[$ip] : array('failures' => 0, 'lockedUntil' => 0);
        if (isset($record['lockedUntil']) && (int) $record['lockedUntil'] > $now) {
            return (int) $record['lockedUntil'] - $now;
        }
        if (isset($record['lockedUntil']) && (int) $record['lockedUntil'] > 0 && (int) $record['lockedUntil'] <= $now) {
            $record['failures'] = 0;
        }
        $record['failures'] = isset($record['failures']) ? (int) $record['failures'] + 1 : 1;
        $record['lockedUntil'] = $record['failures'] >= 5 ? $now + 900 : 0;
        $records[$ip] = $record;
        gfic_atomic_write_unlocked($path, gfic_encode_json($records));
        return $record['lockedUntil'] > 0 ? 900 : 0;
    } finally {
        gfic_release_lock($lock);
    }
}

function gfic_clear_login_failures($ip)
{
    $path = gfic_path('rate_limits.json');
    $lock = gfic_acquire_lock($path, true);
    try {
        $records = gfic_read_json_unlocked($path, array());
        if (is_array($records) && array_key_exists($ip, $records)) {
            unset($records[$ip]);
            gfic_atomic_write_unlocked($path, gfic_encode_json($records));
        }
    } finally {
        gfic_release_lock($lock);
    }
}

function gfic_backup_data()
{
    $dataPath = gfic_path('data.json');
    $current = @file_get_contents($dataPath);
    if ($current === false) {
        throw new RuntimeException('无法读取当前数据，已取消写入');
    }
    $backupDir = gfic_path('backups');
    if (!is_dir($backupDir) && !@mkdir($backupDir, 0750, true)) {
        throw new RuntimeException('无法创建备份目录');
    }
    $suffix = bin2hex(random_bytes(4));
    $backupPath = $backupDir . '/data-' . date('Ymd-His') . '-' . $suffix . '.json';
    gfic_write_exclusive_file($backupPath, $current);
    gfic_write_exclusive_file($backupDir . '/latest.json', $current);

    $cutoff = time() - 30 * 86400;
    $backups = glob($backupDir . '/data-*.json');
    if (is_array($backups)) {
        foreach ($backups as $backup) {
            if (is_file($backup) && filemtime($backup) < $cutoff) {
                @unlink($backup);
            }
        }
    }
}
