import './App.css'

const metrics = [
  { label: 'This month', value: '¥8,420', detail: 'Across 128 records' },
  { label: 'Shared members', value: '4', detail: 'Everyone can contribute' },
  { label: 'Top category', value: 'Groceries', detail: '32% of spending' },
]

const expenses = [
  { member: 'Ava', category: 'Groceries', note: 'Weekly market', amount: '¥236.80' },
  { member: 'Leo', category: 'Transport', note: 'Metro card top-up', amount: '¥80.00' },
  { member: 'Mia', category: 'Utilities', note: 'Electricity bill', amount: '¥318.42' },
]

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark">HF</span>
          <div>
            <strong>Home Finance</strong>
            <span>Shared household ledger</span>
          </div>
        </div>
        <nav>
          <a href="#dashboard" aria-current="page">Dashboard</a>
          <a href="#expenses">Expenses</a>
          <a href="#members">Members</a>
          <a href="#analysis">Analysis</a>
        </nav>
      </aside>

      <section className="workspace" id="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">Household overview</p>
            <h1>Record together, understand spending faster.</h1>
          </div>
          <button type="button">Add expense</button>
        </header>

        <section className="metrics" aria-label="Financial summary">
          {metrics.map((metric) => (
            <article className="metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-header">
              <h2>Recent expenses</h2>
              <span>SQLite backed API ready</span>
            </div>
            <div className="expense-list">
              {expenses.map((expense) => (
                <div className="expense-row" key={`${expense.member}-${expense.note}`}>
                  <div>
                    <strong>{expense.note}</strong>
                    <span>{expense.member} · {expense.category}</span>
                  </div>
                  <b>{expense.amount}</b>
                </div>
              ))}
            </div>
          </article>

          <article className="panel split-panel">
            <div>
              <h2>Collaboration model</h2>
              <p>
                The first API slice supports household members and expense records. Analytics,
                budgets, and sync can be added on top of the same schema.
              </p>
            </div>
            <dl>
              <div>
                <dt>Client</dt>
                <dd>React + Tauri 2</dd>
              </div>
              <div>
                <dt>API</dt>
                <dd>Go + Gin</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>SQLite</dd>
              </div>
            </dl>
          </article>
        </section>
      </section>
    </main>
  )
}

export default App
