import streamlit as st
import requests
import json
from datetime import datetime, date

API_URL = "https://task-manager-production-b4ef.up.railway.app"

st.set_page_config(page_title="TaskManager", layout="wide")

if 'token' not in st.session_state:
    st.session_state.token = None
if 'user' not in st.session_state:
    st.session_state.user = None

def api_call(endpoint, method="GET", data=None):
    headers = {}
    if st.session_state.token:
        headers['Authorization'] = f'Bearer {st.session_state.token}'
    
    url = f"{API_URL}{endpoint}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            response = requests.post(url, json=data, headers=headers)
        elif method == "PUT":
            response = requests.put(url, json=data, headers=headers)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        
        # print(f"Response: {response.status_code}")
        return response.json() if response.status_code < 400 else None
    except Exception as e:
        # print(f"Error: {e}")
        st.error(f"API Error: {str(e)}")
        return None

def login_page():
    st.title("TaskManager Login")
    
    tab1, tab2 = st.tabs(["Login", "Signup"])
    
    with tab1:
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_pass")
        
        if st.button("Login"):
            result = api_call("/login", "POST", {"email": email, "password": password})
            if result and 'token' in result:
                st.session_state.token = result['token']
                st.session_state.user = result['user']
                st.rerun()
            else:
                st.error("Login failed")
    
    with tab2:
        name = st.text_input("Name", key="signup_name")
        email = st.text_input("Email", key="signup_email")
        password = st.text_input("Password", type="password", key="signup_pass")
        role = st.selectbox("Role", ["member", "admin"])
        
        if st.button("Signup"):
            result = api_call("/signup", "POST", {
                "name": name, "email": email, "password": password, "role": role
            })
            if result and 'token' in result:
                st.session_state.token = result['token']
                st.session_state.user = result['user']
                st.rerun()
            else:
                st.error("Signup failed")

def dashboard_page():
    st.title("Dashboard")
    
    data = api_call("/dashboard")
    if not data:
        st.error("Failed to load dashboard")
        return
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Tasks", data.get('total', 0))
    with col2:
        st.metric("My Tasks", data.get('my_tasks', 0))
    with col3:
        st.metric("Overdue", data.get('overdue', 0))
    with col4:
        st.metric("Completed", data.get('done', 0))
    
    st.subheader("Tasks by Status")
    status_data = data.get('by_status', [])
    if status_data:
        for item in status_data:
            st.write(f"**{item['status']}**: {item['count']}")
    
    st.subheader("Recent Tasks")
    tasks = data.get('tasks', [])
    if tasks:
        for task in tasks:
            with st.container():
                col1, col2, col3 = st.columns([3, 1, 1])
                with col1:
                    st.write(f"**{task['title']}** - {task['project_name']}")
                with col2:
                    st.write(f"Status: {task['status']}")
                with col3:
                    st.write(f"Priority: {task['priority']}")
    else:
        st.info("No tasks yet")

def projects_page():
    st.title("Projects")
    
    col1, col2 = st.columns([3, 1])
    with col2:
        if st.button("+ New Project"):
            st.session_state.show_create_project = True
    
    if st.session_state.get('show_create_project'):
        with st.form("create_project"):
            name = st.text_input("Project Name")
            description = st.text_area("Description")
            
            col1, col2 = st.columns(2)
            with col1:
                if st.form_submit_button("Create"):
                    result = api_call("/projects", "POST", {"name": name, "description": description})
                    if result:
                        st.success("Project created!")
                        st.session_state.show_create_project = False
                        st.rerun()
            with col2:
                if st.form_submit_button("Cancel"):
                    st.session_state.show_create_project = False
                    st.rerun()
    
    data = api_call("/projects")
    if data and 'projects' in data:
        for project in data['projects']:
            with st.expander(f"{project['name']} (Owner: {project['owner_name']})"):
                st.write(project.get('description', 'No description'))
                if st.button(f"View Tasks", key=f"view_{project['id']}"):
                    st.session_state.selected_project = project['id']
                    st.session_state.page = 'tasks'
                    st.rerun()

def tasks_page():
    if 'selected_project' not in st.session_state:
        st.warning("Select a project first")
        return
    
    project_id = st.session_state.selected_project
    
    project_data = api_call(f"/projects/{project_id}")
    if project_data:
        st.title(f"Tasks - {project_data['project']['name']}")
    
    col1, col2 = st.columns([3, 1])
    with col2:
        if st.button("+ New Task"):
            st.session_state.show_create_task = True
    
    if st.session_state.get('show_create_task'):
        users_data = api_call("/users")
        users = users_data.get('users', []) if users_data else []
        
        with st.form("create_task"):
            title = st.text_input("Task Title")
            description = st.text_area("Description")
            
            col1, col2 = st.columns(2)
            with col1:
                assignee = st.selectbox("Assign To", 
                    options=[None] + [u['id'] for u in users],
                    format_func=lambda x: "Unassigned" if x is None else next((u['name'] for u in users if u['id'] == x), ""))
                status = st.selectbox("Status", ["todo", "in_progress", "review", "done"])
            with col2:
                priority = st.selectbox("Priority", ["low", "medium", "high", "urgent"])
                due_date = st.date_input("Due Date")
            
            col1, col2 = st.columns(2)
            with col1:
                if st.form_submit_button("Create Task"):
                    result = api_call(f"/projects/{project_id}/tasks", "POST", {
                        "title": title,
                        "description": description,
                        "assignee_id": assignee,
                        "status": status,
                        "priority": priority,
                        "due_date": str(due_date) if due_date else None
                    })
                    if result:
                        st.success("Task created!")
                        st.session_state.show_create_task = False
                        st.rerun()
            with col2:
                if st.form_submit_button("Cancel"):
                    st.session_state.show_create_task = False
                    st.rerun()
    
    tasks_data = api_call(f"/projects/{project_id}/tasks")
    if tasks_data and 'tasks' in tasks_data:
        tasks = tasks_data['tasks']
        
        status_filter = st.selectbox("Filter by Status", ["All"] + ["todo", "in_progress", "review", "done"])
        
        filtered_tasks = tasks
        if status_filter != "All":
            filtered_tasks = [t for t in tasks if t['status'] == status_filter]
        
        for task in filtered_tasks:
            with st.container():
                col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
                
                with col1:
                    st.write(f"**{task['title']}**")
                    if task.get('description'):
                        st.write(f"_{task['description']}_")
                
                with col2:
                    st.write(f"Status: `{task['status']}`")
                
                with col3:
                    st.write(f"Priority: `{task['priority']}`")
                
                with col4:
                    if task.get('assignee_name'):
                        st.write(f" {task['assignee_name']}")
                    
                    if st.button("Delete", key=f"del_{task['id']}"):
                        api_call(f"/tasks/{task['id']}", "DELETE")
                        st.rerun()
                
                st.divider()
    else:
        st.info("No tasks in this project")

def team_page():
    st.title("Team Management")
    
    if 'selected_project' not in st.session_state:
        st.warning("Select a project first")
        return
    
    project_id = st.session_state.selected_project
    
    project_data = api_call(f"/projects/{project_id}")
    if not project_data:
        return
    
    st.subheader("Team Members")
    members = project_data.get('members', [])
    
    for member in members:
        col1, col2 = st.columns([3, 1])
        with col1:
            st.write(f"**{member['name']}** ({member['email']}) - Role: {member['role']}")
    
    st.subheader("Add Member")
    users_data = api_call("/users")
    if users_data:
        users = users_data.get('users', [])
        member_ids = [m['id'] for m in members]
        available_users = [u for u in users if u['id'] not in member_ids]
        
        if available_users:
            with st.form("add_member"):
                user = st.selectbox("Select User", 
                    options=[u['id'] for u in available_users],
                    format_func=lambda x: next((u['name'] for u in available_users if u['id'] == x), ""))
                role = st.selectbox("Role", ["member", "admin"])
                
                if st.form_submit_button("Add Member"):
                    result = api_call(f"/projects/{project_id}/members", "POST", {
                        "user_id": user,
                        "role": role
                    })
                    if result:
                        st.success("Member added!")
                        st.rerun()
        else:
            st.info("All users are already members")

if not st.session_state.token:
    login_page()
else:
    st.sidebar.title(f"Welcome {st.session_state.user['name']}")
    st.sidebar.write(f"Role: {st.session_state.user['role']}")
    
    if st.sidebar.button("Logout"):
        st.session_state.token = None
        st.session_state.user = None
        st.rerun()
    
    st.sidebar.divider()
    
    page = st.sidebar.radio("Navigation", ["Dashboard", "Projects", "Tasks", "Team"])
    
    if page == "Dashboard":
        dashboard_page()
    elif page == "Projects":
        projects_page()
    elif page == "Tasks":
        tasks_page()
    elif page == "Team":
        team_page()
