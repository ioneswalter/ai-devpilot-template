/**
 * AddTaskForm — Inline form for manually adding a task item to an implementation request.
 */

import { useState } from 'react';

interface AddTaskFormProps {
  isAdding: boolean;
  onAdd: (task: { title: string; description?: string; file_path: string; task_type: string }) => Promise<void>;
  onCancel: () => void;
}

export function AddTaskForm({ isAdding, onAdd, onCancel }: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [filePath, setFilePath] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('create');

  function handleSubmit() {
    if (title.trim() && filePath.trim()) {
      onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        file_path: filePath.trim(),
        task_type: taskType,
      }).then(() => {
        setTitle('');
        setFilePath('');
        setDescription('');
      });
    }
  }

  return (
    <div className="border-t pt-4 space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add Task</h4>
      <div className="flex gap-2">
        <select
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 bg-white"
        >
          <option value="create">Create</option>
          <option value="modify">Modify</option>
          <option value="test">Test</option>
          <option value="config">Config</option>
        </select>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title..."
          className="flex-1 text-sm border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
        />
      </div>
      <input
        type="text"
        value={filePath}
        onChange={(e) => setFilePath(e.target.value)}
        placeholder="File path (e.g., apps/web/src/...)"
        className="w-full text-xs font-mono border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        className="w-full text-xs border rounded px-2 py-1.5 h-16 resize-none focus:ring-1 focus:ring-blue-300"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !filePath.trim() || isAdding}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isAdding ? 'Adding...' : 'Add Task'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
