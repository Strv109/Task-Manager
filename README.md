# TaskManager

Team task management app for the assignment.

## Features
- User signup/login with roles (admin/member)
- Create projects and add team members
- Task creation with assignment and status tracking
- Dashboard showing stats and overdue tasks
- Role-based access (admins see all projects)

## Setup

### Backend
```bash
npm install
npm start
```

Backend runs on port 5000

### Frontend
```bash
pip install -r requirements.txt
streamlit run frontend.py
```

Frontend runs on port 8501

## Tech Stack
- **Backend**: Node.js + Express + SQLite
- **Frontend**: Streamlit (Python)
- **Auth**: JWT tokens

## Database
SQLite database gets created automatically on first run with these tables:
- users
- projects
- project_members
- tasks

## Usage
1. Start backend first
2. Start streamlit frontend
3. Signup with admin or member role
4. Create projects and tasks
5. Assign tasks to team members

## Deployment
Works on Railway - just set the PORT environment variable.

For production set a proper SECRET key in app.js