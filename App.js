import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, doc, deleteDoc, query, orderBy, setDoc, getDocs } from 'firebase/firestore';

// --- Firebase Configuration & Initialization ---
// These global variables are provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-kanban-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // Fixed typo here

let app;
let db;
let auth;

// Initialize Firebase only once
if (Object.keys(firebaseConfig).length > 0) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else {
  console.error("Firebase config not found. Data persistence will not work.");
}

// --- Card Component ---
const Card = ({ task, onDragStart, onToggleChecklistItem, onEditTask }) => {
  return (
    <div
      className="bg-white p-4 rounded-lg shadow-md mb-3 cursor-pointer transform transition-transform duration-100 hover:scale-[1.01]"
      draggable="true"
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onEditTask(task)} // Click to edit task
    >
      <h3 className="font-semibold text-gray-800 text-lg mb-1">{task.title}</h3>
      <p className="text-gray-600 text-sm">{task.description}</p>
      {(task.startDate || task.endDate) && (
        <div className="text-xs text-gray-500 mt-2 flex justify-between items-center">
          {task.startDate && <span>Start: {task.startDate}</span>}
          {task.endDate && <span>End: {task.endDate}</span>}
        </div>
      )}
      {task.assignedTo && (
        <div className="text-sm text-blue-700 mt-2 font-medium">
          Assigned to: {task.assignedTo}
        </div>
      )}

      {task.checklist && task.checklist.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <h4 className="font-semibold text-gray-700 text-sm mb-2">Checklist:</h4>
          {task.checklist.map((item) => (
            <div key={item.id} className="flex items-center mb-1">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={(e) => {
                  e.stopPropagation(); // Prevent card click event when checkbox is clicked
                  onToggleChecklistItem(task.id, item.id);
                }}
                className="form-checkbox h-4 w-4 text-blue-600 rounded-md transition-colors duration-200"
              />
              <span className={`ml-2 text-gray-700 text-sm ${item.completed ? 'line-through text-gray-500' : ''}`}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Column Component ---
const Column = ({ title, tasks, onDragOver, onDrop, onDragStart, onAddTask, onToggleChecklistItem, onEditTask, onConfirmDeleteColumn, columnId }) => {
  return (
    <div
      className="bg-gray-100 p-4 rounded-lg shadow-inner flex flex-col min-w-[280px] w-full md:w-1/3 lg:w-1/4 xl:w-1/5 max-w-sm"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex justify-between items-center mb-4 border-b-2 border-blue-400 pb-2">
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        {/* Only allow deletion for non-default columns */}
        {['To Do', 'In Progress', 'Done'].includes(title) ? (
          <span className="text-gray-500 text-xs">(Core)</span>
        ) : (
          <button
            onClick={() => onConfirmDeleteColumn(columnId, title)}
            className="text-red-500 hover:text-red-700 text-lg font-bold px-2 py-1 rounded-full leading-none"
            title={`Delete column "${title}"`}
          >
            &times;
          </button>
        )}
      </div>
      <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
        {tasks.map((task) => (
          <Card
            key={task.id}
            task={task}
            onDragStart={onDragStart}
            onToggleChecklistItem={onToggleChecklistItem}
            onEditTask={onEditTask} // Pass onEditTask to Card
          />
        ))}
      </div>
      {title === "To Do" && ( // Only show add task button for "To Do" column
        <button
          onClick={onAddTask}
          className="mt-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
        >
          + Add Task
        </button>
      )}
    </div>
  );
};

// --- PersonnelManager Component ---
const PersonnelManager = ({ userId, db, personnel, setPersonnel, isLoadingPersonnel }) => {
  const [newPersonnelName, setNewPersonnelName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [personnelToDelete, setPersonnelToDelete] = useState(null);

  const handleAddPersonnel = async () => {
    if (!newPersonnelName.trim()) {
      alert("Personnel name cannot be empty.");
      return;
    }
    if (!userId) {
      alert("User not authenticated. Cannot add personnel.");
      return;
    }

    try {
      const personnelCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/personnel`);
      await addDoc(personnelCollectionRef, {
        name: newPersonnelName.trim(),
        createdAt: new Date().toISOString(), // Add a timestamp
      });
      setNewPersonnelName('');
    } catch (error) {
      console.error("Error adding personnel: ", error);
      alert("Failed to add personnel. Check console for details.");
    }
  };

  const handleDeletePersonnel = async (personnelId) => {
    if (!userId) {
      alert("User not authenticated. Cannot delete personnel.");
      return;
    }
    try {
      const personnelDocRef = doc(db, `artifacts/${appId}/users/${userId}/personnel`, personnelId);
      await deleteDoc(personnelDocRef);
      setShowDeleteConfirm(false);
      setPersonnelToDelete(null);
    } catch (error) {
      console.error("Error deleting personnel: ", error);
      alert("Failed to delete personnel. Check console for details.");
    }
  };

  const confirmDelete = (personnelItem) => {
    setPersonnelToDelete(personnelItem);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPersonnelToDelete(null);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-blue-400 pb-2">Personnel Management</h2>

      <div className="mb-6 flex gap-2">
        <input
          type="text"
          className="shadow appearance-none border rounded flex-grow py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          placeholder="New personnel name"
          value={newPersonnelName}
          onChange={(e) => setNewPersonnelName(e.target.value)}
        />
        <button
          onClick={handleAddPersonnel}
          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
          disabled={!userId}
        >
          Add Personnel
        </button>
      </div>

      {isLoadingPersonnel ? (
        <p className="text-gray-600">Loading personnel...</p>
      ) : (
        <ul className="space-y-3">
          {personnel.length === 0 ? (
            <p className="text-gray-600">No personnel added yet.</p>
          ) : (
            personnel.map((p) => (
              <li key={p.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-md shadow-sm">
                <span className="text-gray-800 font-medium">{p.name}</span>
                <button
                  onClick={() => confirmDelete(p)}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-1 px-3 rounded-full transition-colors duration-200"
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && personnelToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Deletion</h3>
            <p className="text-gray-700 mb-6">Are you sure you want to delete "{personnelToDelete.name}"?</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={cancelDelete}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeletePersonnel(personnelToDelete.id)}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- EditTaskModal Component ---
const EditTaskModal = ({
  task,
  personnel,
  onClose,
  onUpdateTask,
  onDeleteTask,
  currentUserId,
  db,
  appId
}) => {
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description);
  const [editStartDate, setEditStartDate] = useState(task.startDate);
  const [editEndDate, setEditEndDate] = useState(task.endDate);
  const [editAssignedTo, setEditAssignedTo] = useState(task.assignedTo);
  const [editChecklistItems, setEditChecklistItems] = useState(task.checklist || []);
  const [currentEditChecklistItemText, setCurrentEditChecklistItemText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleAddEditChecklistItem = useCallback(() => {
    if (currentEditChecklistItemText.trim()) {
      setEditChecklistItems((prevItems) => [
        ...prevItems,
        { id: Date.now().toString(), text: currentEditChecklistItemText.trim(), completed: false },
      ]);
      setCurrentEditChecklistItemText('');
    }
  }, [currentEditChecklistItemText]);

  const handleDeleteEditChecklistItem = useCallback((idToDelete) => {
    setEditChecklistItems((prevItems) => prevItems.filter(item => item.id !== idToDelete));
  }, []);

  const handleToggleEditChecklistItem = useCallback((itemId) => {
    setEditChecklistItems((prevItems) => prevItems.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ));
  }, []);

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      alert("Task title cannot be empty.");
      return;
    }

    const updatedTask = {
      ...task,
      title: editTitle.trim(),
      description: editDescription.trim() || 'No description provided.',
      startDate: editStartDate || null,
      endDate: editEndDate || null,
      assignedTo: editAssignedTo || null,
      checklist: editChecklistItems,
    };
    onUpdateTask(updatedTask);
    onClose();
  };

  const confirmTaskDelete = () => {
    setShowDeleteConfirm(true);
  };

  const cancelTaskDelete = () => {
    setShowDeleteConfirm(false);
  };

  const executeTaskDelete = () => {
    onDeleteTask(task.id);
    onClose();
  };


  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Edit Task</h2>
        <div className="mb-4">
          <label htmlFor="editTaskTitle" className="block text-gray-700 text-sm font-bold mb-2">
            Task Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="editTaskTitle"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="e.g., Complete report"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="editTaskDescription" className="block text-gray-700 text-sm font-bold mb-2">
            Description
          </label>
          <textarea
            id="editTaskDescription"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="e.g., Draft executive summary and gather data."
            rows="3"
          ></textarea>
        </div>
        <div className="mb-4">
          <label htmlFor="editStartDate" className="block text-gray-700 text-sm font-bold mb-2">
            Start Date
          </label>
          <input
            type="date"
            id="editStartDate"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={editStartDate}
            onChange={(e) => setEditStartDate(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="editEndDate" className="block text-gray-700 text-sm font-bold mb-2">
            End Date
          </label>
          <input
            type="date"
            id="editEndDate"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={editEndDate}
            onChange={(e) => setEditEndDate(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="editAssignedTo" className="block text-gray-700 text-sm font-bold mb-2">
            Assigned To
          </label>
          <select
            id="editAssignedTo"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={editAssignedTo || ''} // Handle null assignedTo
            onChange={(e) => setEditAssignedTo(e.target.value)}
          >
            <option value="">Select Personnel (Optional)</option>
            {personnel.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Checklist Section in Edit Modal */}
        <div className="mb-6 pt-4 border-t border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-3">Checklist</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              className="shadow appearance-none border rounded flex-grow py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              placeholder="Add a checklist item"
              value={currentEditChecklistItemText}
              onChange={(e) => setCurrentEditChecklistItemText(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddEditChecklistItem();
                }
              }}
            />
            <button
              onClick={handleAddEditChecklistItem}
              className="bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
            >
              Add
            </button>
          </div>
          <ul className="space-y-2">
            {editChecklistItems.map((item) => (
              <li key={item.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-md">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggleEditChecklistItem(item.id)}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded-md transition-colors duration-200"
                  />
                  <span className={`ml-2 text-gray-700 text-sm ${item.completed ? 'line-through text-gray-500' : ''}`}>
                    {item.text}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteEditChecklistItem(item.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-between items-center gap-3 mt-6">
          <button
            onClick={confirmTaskDelete} // Button to initiate delete confirmation
            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75"
          >
            Delete Task
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
            >
              Update Task
            </button>
          </div>
        </div>

        {/* Delete Task Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Task Deletion</h3>
              <p className="text-gray-700 mb-6">Are you sure you want to delete the task "{task.title}"?</p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={cancelTaskDelete}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={executeTaskDelete}
                  className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main App Component ---
const App = () => {
  const [activeView, setActiveView] = useState('kanban'); // 'kanban' or 'personnel'
  const [columns, setColumns] = useState([]); // Columns will be loaded from Firestore
  const [personnel, setPersonnel] = useState([]); // Personnel will be loaded from Firestore

  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [draggedFromColumnId, setDraggedFromColumnId] = useState(null);

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskEndDate, setNewTaskEndDate] = useState('');
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState('');
  const [newTaskChecklistItems, setNewTaskChecklistItems] = useState([]);
  const [currentChecklistItemText, setCurrentChecklistItemText] = useState('');

  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingPersonnel, setIsLoadingPersonnel] = useState(true);
  const [isLoadingColumns, setIsLoadingColumns] = useState(true); // New loading state for columns

  const [newColumnTitle, setNewColumnTitle] = useState(''); // State for new column input
  const [showColumnDeleteConfirm, setShowColumnDeleteConfirm] = useState(false); // For column deletion
  const [columnToDelete, setColumnToDelete] = useState(null);
  const [columnToDeleteTitle, setColumnToDeleteTitle] = useState('');


  // --- Firebase Authentication and Data Loading ---
  useEffect(() => {
    if (!auth || !db) {
      console.warn("Firebase not initialized. Check firebaseConfig.");
      setIsAuthReady(true);
      setIsLoadingTasks(false);
      setIsLoadingPersonnel(false);
      setIsLoadingColumns(false); // Also set column loading to false
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        console.log("Authenticated with UID:", user.uid);
      } else {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
          setCurrentUserId(auth.currentUser?.uid || crypto.randomUUID());
          console.log("Signed in anonymously or with custom token.");
        } catch (error) {
          console.error("Error during authentication:", error);
          setCurrentUserId(crypto.randomUUID());
        }
      }
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  // --- Load Columns from Firestore ---
  useEffect(() => {
    if (!isAuthReady || !currentUserId || !db) return;

    setIsLoadingColumns(true);
    const columnsCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/boardColumns`);
    // Order columns by 'order' field to maintain their sequence
    const q = query(columnsCollectionRef, orderBy('order'));

    const unsubscribeColumns = onSnapshot(q, async (snapshot) => {
      let fetchedColumns = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const defaultColumnTitles = ['To Do', 'In Progress', 'Done'];
      let columnsToCreate = [];

      defaultColumnTitles.forEach((title, index) => {
        const exists = fetchedColumns.some(col => col.title === title);
        if (!exists) {
          columnsToCreate.push({ title: title, order: index });
        }
      });

      if (columnsToCreate.length > 0) {
        console.log("Creating missing default columns:", columnsToCreate.map(c => c.title).join(', '));
        // Add missing default columns to Firestore
        await Promise.all(columnsToCreate.map(col => addDoc(columnsCollectionRef, col)));
        // Re-fetch all columns to get the newly added ones with their Firestore IDs
        const updatedSnapshot = await getDocs(query(columnsCollectionRef, orderBy('order')));
        fetchedColumns = updatedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      setColumns(fetchedColumns);
      setIsLoadingColumns(false);
    }, (error) => {
      console.error("Error fetching columns:", error);
      setIsLoadingColumns(false);
    });

    return () => unsubscribeColumns();
  }, [isAuthReady, currentUserId, db]); // Rerun when auth is ready or user changes

  // --- Load Tasks from Firestore ---
  useEffect(() => {
    if (!isAuthReady || !currentUserId || !db || isLoadingColumns) return; // Wait for columns to load

    setIsLoadingTasks(true);
    const tasksCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/tasks`);
    const q = query(tasksCollectionRef);

    const unsubscribeTasks = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Create a mutable copy of columns to assign tasks
      // Ensure columns are deeply copied to avoid direct mutation issues
      const columnsWithTasks = columns.map(col => ({ ...col, tasks: [] }));

      fetchedTasks.forEach(task => {
        const targetColumn = columnsWithTasks.find(col => col.id === task.status);
        if (targetColumn) {
          targetColumn.tasks.push(task);
        } else {
          // If task has an invalid/missing status, try to put it in 'To Do'
          const todoColumn = columnsWithTasks.find(col => col.title === 'To Do');
          if (todoColumn) {
            todoColumn.tasks.push(task);
          } else if (columnsWithTasks.length > 0) {
            // Fallback to the first column if 'To Do' isn't found
            columnsWithTasks[0].tasks.push(task);
          }
        }
      });
      setColumns(columnsWithTasks); // Update columns state with tasks
      setIsLoadingTasks(false);
    }, (error) => {
      console.error("Error fetching tasks:", error);
      setIsLoadingTasks(false);
    });

    return () => unsubscribeTasks();
  }, [isAuthReady, currentUserId, db, columns, isLoadingColumns]); // Depend on columns to re-map tasks

  // --- Load Personnel from Firestore ---
  useEffect(() => {
    if (!isAuthReady || !currentUserId || !db) return;

    setIsLoadingPersonnel(true);
    const personnelCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/personnel`);
    const q = query(personnelCollectionRef);

    const unsubscribePersonnel = onSnapshot(q, (snapshot) => {
      const fetchedPersonnel = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPersonnel(fetchedPersonnel);
      setIsLoadingPersonnel(false);
    }, (error) => {
      console.error("Error fetching personnel:", error);
      setIsLoadingPersonnel(false);
    });

    return () => unsubscribePersonnel();
  }, [isAuthReady, currentUserId, db]);


  // --- Drag and Drop Handlers ---
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    const fromColumn = columns.find(col => col.tasks.some(task => task.id === taskId));
    if (fromColumn) {
      setDraggedFromColumnId(fromColumn.id);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetColumnId) => {
    e.preventDefault();

    if (!draggedTaskId || !draggedFromColumnId || !currentUserId) return;

    if (draggedFromColumnId === targetColumnId) {
      setDraggedTaskId(null);
      setDraggedFromColumnId(null);
      return;
    }

    // Optimistic UI update
    setColumns((prevColumns) => {
      const newColumns = prevColumns.map((column) => ({ ...column, tasks: [...column.tasks] }));
      let taskToMove = null;
      const sourceColumnIndex = newColumns.findIndex((col) => col.id === draggedFromColumnId);
      if (sourceColumnIndex !== -1) {
        const sourceColumn = newColumns[sourceColumnIndex];
        const taskIndex = sourceColumn.tasks.findIndex((task) => task.id === draggedTaskId);
        if (taskIndex !== -1) {
          taskToMove = sourceColumn.tasks.splice(taskIndex, 1)[0];
        }
      }
      if (taskToMove) {
        const targetColumnIndex = newColumns.findIndex((col) => col.id === targetColumnId);
        if (targetColumnIndex !== -1) {
          newColumns[targetColumnIndex].tasks.push({ ...taskToMove, status: targetColumnId });
        }
      }
      return newColumns;
    });

    // Update in Firestore
    try {
      const taskDocRef = doc(db, `artifacts/${appId}/users/${currentUserId}/tasks`, draggedTaskId);
      await setDoc(taskDocRef, { status: targetColumnId }, { merge: true });
    } catch (error) {
      console.error("Error updating task status in Firestore:", error);
      alert("Failed to update task status. Please try again.");
    }

    setDraggedTaskId(null);
    setDraggedFromColumnId(null);
  };

  // --- Add Task Modal Handlers ---
  const handleAddTask = () => {
    if (!currentUserId) {
      alert("Please wait for authentication to complete before adding tasks.");
      return;
    }
    setShowAddTaskModal(true);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskStartDate('');
    setNewTaskEndDate('');
    setNewTaskAssignedTo('');
    setNewTaskChecklistItems([]);
    setCurrentChecklistItemText('');
  };

  const handleSaveTask = async () => {
    if (!newTaskTitle.trim()) {
      alert("Task title cannot be empty.");
      return;
    }
    if (!currentUserId) {
      alert("User not authenticated. Cannot add task.");
      return;
    }

    try {
      const tasksCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/tasks`);
      await addDoc(tasksCollectionRef, {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || 'No description provided.',
        startDate: newTaskStartDate || null,
        endDate: newTaskEndDate || null,
        assignedTo: newTaskAssignedTo.trim() || null,
        checklist: newTaskChecklistItems,
        status: 'todo', // New tasks always start in 'To Do'
        createdAt: new Date().toISOString(),
      });
      setShowAddTaskModal(false);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskStartDate('');
      setNewTaskEndDate('');
      setNewTaskAssignedTo('');
      setNewTaskChecklistItems([]);
      setCurrentChecklistItemText('');
    } catch (error) {
      console.error("Error adding task: ", error);
      alert("Failed to add task. Check console for details.");
    }
  };

  const handleCloseAddModal = () => {
    setShowAddTaskModal(false);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskStartDate('');
    setNewTaskEndDate('');
    setNewTaskAssignedTo('');
    setNewTaskChecklistItems([]);
    setCurrentChecklistItemText('');
  };

  // --- Checklist Item Management in Add Task Modal ---
  const handleAddChecklistItem = useCallback(() => {
    if (currentChecklistItemText.trim()) {
      setNewTaskChecklistItems((prevItems) => [
        ...prevItems,
        { id: Date.now().toString(), text: currentChecklistItemText.trim(), completed: false },
      ]);
      setCurrentChecklistItemText('');
    }
  }, [currentChecklistItemText]);

  const handleDeleteChecklistItem = useCallback((idToDelete) => {
    setNewTaskChecklistItems((prevItems) => prevItems.filter(item => item.id !== idToDelete));
  }, []);

  // --- Toggle Checklist Item Completion (on Card) ---
  const handleToggleChecklistItem = async (taskId, itemId) => {
    if (!currentUserId || !db) return;

    const taskToUpdate = columns.flatMap(col => col.tasks).find(task => task.id === taskId);

    if (taskToUpdate) {
      const updatedChecklist = taskToUpdate.checklist.map(item =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      );

      // Optimistic UI update
      setColumns(prevColumns =>
        prevColumns.map(col =>
          col.id === taskToUpdate.status
            ? {
                ...col,
                tasks: col.tasks.map(task =>
                  task.id === taskId ? { ...task, checklist: updatedChecklist } : task
                ),
              }
            : col
        )
      );

      // Update in Firestore
      try {
        const taskDocRef = doc(db, `artifacts/${appId}/users/${currentUserId}/tasks`, taskId);
        await setDoc(taskDocRef, { checklist: updatedChecklist }, { merge: true });
      } catch (error) {
        console.error("Error updating checklist item in Firestore:", error);
        alert("Failed to update checklist item. Please try again.");
      }
    }
  };

  // --- Edit Task Handlers ---
  const handleEditTask = (task) => {
    if (!currentUserId) {
      alert("Please wait for authentication to complete before editing tasks.");
      return;
    }
    setTaskToEdit(task);
    setShowEditTaskModal(true);
  };

  const handleUpdateTask = async (updatedTask) => {
    if (!currentUserId || !db) {
      alert("User not authenticated. Cannot update task.");
      return;
    }
    try {
      const taskDocRef = doc(db, `artifacts/${appId}/users/${currentUserId}/tasks`, updatedTask.id);
      const { status, ...dataToUpdate } = updatedTask;
      await setDoc(taskDocRef, dataToUpdate, { merge: true });
      setShowEditTaskModal(false);
      setTaskToEdit(null);
    } catch (error) {
      console.error("Error updating task: ", error);
      alert("Failed to update task. Check console for details.");
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!currentUserId || !db) {
      alert("User not authenticated. Cannot delete task.");
      return;
    }
    try {
      const taskDocRef = doc(db, `artifacts/${appId}/users/${currentUserId}/tasks`, taskId);
      await deleteDoc(taskDocRef);
      setShowEditTaskModal(false);
      setTaskToEdit(null);
    } catch (error) {
      console.error("Error deleting task: ", error);
      alert("Failed to delete task. Check console for details.");
    }
  };

  const handleCloseEditModal = () => {
    setShowEditTaskModal(false);
    setTaskToEdit(null);
  };

  // --- New Column Management Handlers ---
  const handleAddColumn = async () => {
    if (!newColumnTitle.trim()) {
      alert("Column title cannot be empty.");
      return;
    }
    if (!currentUserId || !db) {
      alert("User not authenticated. Cannot add column.");
      return;
    }

    try {
      const columnsCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/boardColumns`);
      const newOrder = columns.length > 0 ? Math.max(...columns.map(col => col.order)) + 1 : 0;
      await addDoc(columnsCollectionRef, {
        title: newColumnTitle.trim(),
        order: newOrder,
        createdAt: new Date().toISOString(),
      });
      setNewColumnTitle('');
    } catch (error) {
      console.error("Error adding column: ", error);
      alert("Failed to add column. Check console for details.");
    }
  };

  const handleConfirmDeleteColumn = (columnId, columnTitle) => {
    if (['To Do', 'In Progress', 'Done'].includes(columnTitle)) {
      alert(`The core column "${columnTitle}" cannot be deleted.`);
      return;
    }
    setColumnToDelete(columnId);
    setColumnToDeleteTitle(columnTitle);
    setShowColumnDeleteConfirm(true);
  };

  const handleCancelDeleteColumn = () => {
    setShowColumnDeleteConfirm(false);
    setColumnToDelete(null);
    setColumnToDeleteTitle('');
  };

  const executeDeleteColumn = async () => {
    if (!columnToDelete || !currentUserId || !db) return;

    try {
      // 1. Move tasks from the column being deleted to the 'To Do' column
      const tasksInColumnToDelete = columns.find(col => col.id === columnToDelete)?.tasks || [];
      const todoColumn = columns.find(col => col.title === 'To Do');

      if (todoColumn) {
        const batchUpdates = tasksInColumnToDelete.map(task => {
          const taskDocRef = doc(db, `artifacts/${appId}/users/${currentUserId}/tasks`, task.id);
          return setDoc(taskDocRef, { status: todoColumn.id }, { merge: true });
        });
        await Promise.all(batchUpdates);
        console.log(`Moved ${tasksInColumnToDelete.length} tasks to "To Do" column.`);
      } else {
        console.warn("To Do column not found. Tasks from deleted column might become unassigned.");
      }

      // 2. Delete the column itself
      const columnDocRef = doc(db, `artifacts/${appId}/users/${currentUserId}/boardColumns`, columnToDelete);
      await deleteDoc(columnDocRef);
      console.log(`Column "${columnToDeleteTitle}" deleted.`);

      setShowColumnDeleteConfirm(false);
      setColumnToDelete(null);
      setColumnToDeleteTitle('');
    } catch (error) {
      console.error("Error deleting column: ", error);
      alert("Failed to delete column. Check console for details.");
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 p-6 font-inter">
      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        .font-inter {
          font-family: 'Inter', sans-serif;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        `}
      </style>
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-blue-700 drop-shadow-lg">
          Task Monitoring
        </h1>
        <p className="text-lg text-gray-600 mt-2">Visualize your workflow, track your tasks.</p>
        {currentUserId && (
          <p className="text-sm text-gray-500 mt-1">Your User ID: <span className="font-mono bg-gray-200 px-2 py-1 rounded">{currentUserId}</span></p>
        )}
      </header>

      {/* Navigation Tabs */}
      <div className="flex justify-center mb-8 gap-4">
        <button
          onClick={() => setActiveView('kanban')}
          className={`py-2 px-6 rounded-full font-semibold transition-all duration-300 ${
            activeView === 'kanban'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Kanban Board
        </button>
        <button
          onClick={() => setActiveView('personnel')}
          className={`py-2 px-6 rounded-full font-semibold transition-all duration-300 ${
            activeView === 'personnel'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Personnel Management
        </button>
      </div>

      {/* Conditional Rendering of Views */}
      {activeView === 'kanban' && (
        isLoadingTasks || isLoadingColumns ? (
          <div className="text-center text-gray-600 text-lg mt-10">Loading board...</div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:justify-center items-start md:items-stretch gap-6">
              {columns.map((column) => (
                <Column
                  key={column.id}
                  columnId={column.id} // Pass columnId for deletion
                  title={column.title}
                  tasks={column.tasks || []}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, column.id)}
                  onDragStart={handleDragStart}
                  onAddTask={handleAddTask}
                  onToggleChecklistItem={handleToggleChecklistItem}
                  onEditTask={handleEditTask}
                  onConfirmDeleteColumn={handleConfirmDeleteColumn} // Pass delete handler
                />
              ))}
              {/* Add New Column Input */}
              <div className="bg-gray-100 p-4 rounded-lg shadow-inner flex flex-col min-w-[280px] w-full md:w-1/3 lg:w-1/4 xl:w-1/5 max-w-sm">
                <h2 className="text-xl font-bold text-gray-800 mb-4 border-b-2 border-gray-400 pb-2">Add New Column</h2>
                <input
                  type="text"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-3"
                  placeholder="Column title"
                  value={newColumnTitle}
                  onChange={(e) => setNewColumnTitle(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddColumn();
                    }
                  }}
                />
                <button
                  onClick={handleAddColumn}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75"
                  disabled={!currentUserId}
                >
                  Add Column
                </button>
              </div>
            </div>
          </>
        )
      )}

      {activeView === 'personnel' && (
        <PersonnelManager
          userId={currentUserId}
          db={db}
          personnel={personnel}
          setPersonnel={setPersonnel}
          isLoadingPersonnel={isLoadingPersonnel}
        />
      )}

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Add New Task</h2>
            <div className="mb-4">
              <label htmlFor="taskTitle" className="block text-gray-700 text-sm font-bold mb-2">
                Task Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="taskTitle"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Complete report"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="taskDescription" className="block text-gray-700 text-sm font-bold mb-2">
                Description
              </label>
              <textarea
                id="taskDescription"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="e.g., Draft executive summary and gather data."
                rows="3"
              ></textarea>
            </div>
            <div className="mb-4">
              <label htmlFor="startDate" className="block text-gray-700 text-sm font-bold mb-2">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                value={newTaskStartDate}
                onChange={(e) => setNewTaskStartDate(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="endDate" className="block text-gray-700 text-sm font-bold mb-2">
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                value={newTaskEndDate}
                onChange={(e) => setNewTaskEndDate(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="assignedTo" className="block text-gray-700 text-sm font-bold mb-2">
                Assigned To
              </label>
              <select
                id="assignedTo"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                value={newTaskAssignedTo}
                onChange={(e) => setNewTaskAssignedTo(e.target.value)}
              >
                <option value="">Select Personnel (Optional)</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Checklist Section in Modal */}
            <div className="mb-6 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-3">Checklist</h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  className="shadow appearance-none border rounded flex-grow py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  placeholder="Add a checklist item"
                  value={currentChecklistItemText}
                  onChange={(e) => setCurrentChecklistItemText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                />
                <button
                  onClick={handleAddChecklistItem}
                  className="bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
                >
                  Add
                </button>
              </div>
              <ul className="space-y-2">
                {newTaskChecklistItems.map((item) => (
                  <li key={item.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-md">
                    <span className="text-gray-700 text-sm">{item.text}</span>
                    <button
                      onClick={() => handleDeleteChecklistItem(item.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseAddModal}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTask}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditTaskModal && taskToEdit && (
        <EditTaskModal
          task={taskToEdit}
          personnel={personnel}
          onClose={handleCloseEditModal}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          currentUserId={currentUserId}
          db={db}
          appId={appId}
        />
      )}

      {/* Column Delete Confirmation Modal */}
      {showColumnDeleteConfirm && columnToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Column Deletion</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete the column "<strong>{columnToDeleteTitle}</strong>"?
              All tasks in this column will be moved to "To Do".
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={handleCancelDeleteColumn}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteColumn}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
              >
                Delete Column
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
