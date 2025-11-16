
CREATE TABLE Roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(32) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role_id INT,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    password_changed_at DATETIME,
    password_expiry DATETIME,
    account_locked_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    FOREIGN KEY (role_id) REFERENCES Roles(role_id)
);

CREATE TABLE UserSessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    device_fingerprint VARCHAR(255),
    tls_version VARCHAR(20),
    cipher_suite VARCHAR(255),
    certificate_signature VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE LoginAttempts (
    attempt_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    ip_address VARCHAR(45) NOT NULL,
    username VARCHAR(255),
    success BOOLEAN DEFAULT FALSE,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE PasswordHistory (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    old_password VARCHAR(255) NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE TrustedDevices (
    device_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    UNIQUE(user_id, device_fingerprint)
);

CREATE TABLE MFATokens (
    token_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    token_type VARCHAR(20) NOT NULL,
    token_value VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE AuditLogs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    operation VARCHAR(20) NOT NULL,
    table_name VARCHAR(50),
    row_id INT,
    event_type VARCHAR(32),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    changes TEXT,
    extra TEXT,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE Cats (
    cat_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    breed VARCHAR(64),
    birth_date DATE,
    friends VARCHAR(128),
    caretaker_id INT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (caretaker_id) REFERENCES Users(user_id)
);

CREATE TABLE CaretakerAssignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    cat_id INT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unassigned_at DATETIME,
    UNIQUE(user_id, cat_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (cat_id) REFERENCES Cats(cat_id)
);
