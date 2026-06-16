package store

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS categories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	kind TEXT NOT NULL DEFAULT 'expense',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS expenses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	member_id INTEGER NOT NULL,
	category_id INTEGER NOT NULL,
	amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
	currency TEXT NOT NULL DEFAULT 'CNY',
	note TEXT NOT NULL DEFAULT '',
	spent_at TIMESTAMP NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id),
	FOREIGN KEY (member_id) REFERENCES members(id),
	FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_household_spent_at ON expenses(household_id, spent_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_household_name ON members(household_id, name);
`
