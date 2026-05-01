const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;


app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
  res.send('TaskManager Backend is LIVE. API endpoints are available at /api');
});

const SECRET = process.env.JWT_SECRET || 'mysecretkey123';

const db = new sqlite3.Database('./tasks.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'member'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    owner_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    user_id INTEGER,
    role TEXT DEFAULT 'member'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    project_id INTEGER,
    assignee_id INTEGER,
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    due_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'no token' });
  
  try {
    const decoded = jwt.verify(token, SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid token' });
  }
}

app.post('/api/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [name, email, hashedPassword, role || 'member'], function(err) {
      if (err) return res.status(400).json({ error: 'email exists' });
      
      const token = jwt.sign({ id: this.lastID, role: role || 'member' }, SECRET);
      res.json({ token, user: { id: this.lastID, name, email, role: role || 'member' } });
    });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'invalid credentials' });
    
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });
});

app.get('/api/users', auth, (req, res) => {
  db.all('SELECT id, name, email, role FROM users', (err, users) => {
    res.json({ users });
  });
});

app.get('/api/projects', auth, (req, res) => {
  let query = 'SELECT p.*, u.name as owner_name FROM projects p JOIN users u ON p.owner_id = u.id';
  let params = [];
  
  if (req.userRole !== 'admin') {
    query += ' WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)';
    params = [req.userId];
  }
  
  db.all(query, params, (err, projects) => {
    res.json({ projects });
  });
});

app.post('/api/projects', auth, (req, res) => {
  const { name, description } = req.body;
  
  db.run('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)',
    [name, description, req.userId], function(err) {
      if (err) return res.status(400).json({ error: 'failed' });
      
      db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
        [this.lastID, req.userId, 'admin']);
      
      res.json({ project: { id: this.lastID, name, description } });
    });
});

app.get('/api/projects/:id', auth, (req, res) => {
  db.get('SELECT p.*, u.name as owner_name FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?',
    [req.params.id], (err, project) => {
      if (!project) return res.status(404).json({ error: 'not found' });
      
      db.all(`SELECT u.id, u.name, u.email, pm.role FROM project_members pm 
              JOIN users u ON pm.user_id = u.id WHERE pm.project_id = ?`,
        [req.params.id], (err, members) => {
          res.json({ project, members });
        });
    });
});

app.post('/api/projects/:id/members', auth, (req, res) => {
  const { user_id, role } = req.body;
  
  db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
    [req.params.id, user_id, role || 'member'], function(err) {
      if (err) return res.status(400).json({ error: 'already member' });
      res.json({ success: true });
    });
});

app.get('/api/projects/:id/tasks', auth, (req, res) => {
  db.all(`SELECT t.*, u.name as assignee_name FROM tasks t 
          LEFT JOIN users u ON t.assignee_id = u.id 
          WHERE t.project_id = ? ORDER BY t.created_at DESC`,
    [req.params.id], (err, tasks) => {
      res.json({ tasks });
    });
});

app.post('/api/projects/:id/tasks', auth, (req, res) => {
  const { title, description, assignee_id, status, priority, due_date } = req.body;
  
  db.run(`INSERT INTO tasks (title, description, project_id, assignee_id, status, priority, due_date) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, description, req.params.id, assignee_id, status || 'todo', priority || 'medium', due_date],
    function(err) {
      if (err) return res.status(400).json({ error: 'failed' });
      res.json({ task: { id: this.lastID, title, status } });
    });
});

app.put('/api/tasks/:id', auth, (req, res) => {
  const { title, description, assignee_id, status, priority, due_date } = req.body;
  
  db.run(`UPDATE tasks SET title = ?, description = ?, assignee_id = ?, 
          status = ?, priority = ?, due_date = ? WHERE id = ?`,
    [title, description, assignee_id, status, priority, due_date, req.params.id],
    function(err) {
      if (err) return res.status(400).json({ error: 'failed' });
      res.json({ success: true });
    });
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], function(err) {
    res.json({ success: true });
  });
});

app.get('/api/dashboard', auth, (req, res) => {
  let projectQuery = 'SELECT id FROM projects';
  let params = [];
  
  if (req.userRole !== 'admin') {
    projectQuery += ' WHERE id IN (SELECT project_id FROM project_members WHERE user_id = ?)';
    params = [req.userId];
  }
  
  db.all(projectQuery, params, (err, projects) => {
    const projectIds = projects.map(p => p.id);
    if (projectIds.length === 0) {
      return res.json({ total: 0, my_tasks: 0, overdue: 0, done: 0, by_status: [], tasks: [] });
    }
    
    const placeholders = projectIds.map(() => '?').join(',');
    
    db.get(`SELECT COUNT(*) as total FROM tasks WHERE project_id IN (${placeholders})`,
      projectIds, (err, total) => {
        
        db.get(`SELECT COUNT(*) as count FROM tasks WHERE project_id IN (${placeholders}) AND assignee_id = ?`,
          [...projectIds, req.userId], (err, myTasks) => {
            
            db.get(`SELECT COUNT(*) as count FROM tasks WHERE project_id IN (${placeholders}) 
                    AND due_date < date('now') AND status != 'done'`,
              projectIds, (err, overdue) => {
                
                db.get(`SELECT COUNT(*) as count FROM tasks WHERE project_id IN (${placeholders}) AND status = 'done'`,
                  projectIds, (err, done) => {
                    
                    db.all(`SELECT status, COUNT(*) as count FROM tasks WHERE project_id IN (${placeholders}) GROUP BY status`,
                      projectIds, (err, byStatus) => {
                        
                        db.all(`SELECT t.*, p.name as project_name, u.name as assignee_name
                                FROM tasks t JOIN projects p ON t.project_id = p.id 
                                LEFT JOIN users u ON t.assignee_id = u.id 
                                WHERE t.project_id IN (${placeholders}) 
                                ORDER BY t.created_at DESC LIMIT 10`,
                          projectIds, (err, tasks) => {
                            
                            res.json({
                              total: total.total,
                              my_tasks: myTasks.count,
                              overdue: overdue.count,
                              done: done.count,
                              by_status: byStatus,
                              tasks: tasks
                            });
                          });
                      });
                  });
              });
          });
      });
  });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});