import React from 'react';
import { useParams } from 'react-router-dom';
import { TableEditorV2 } from '../components/TableEditorV2';
import { useAuth } from '../contexts/AuthContext';

export function TableEditorV2Page() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const { user } = useAuth();

  if (!restaurantId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Restaurant ID not provided</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Please log in to access this page</p>
      </div>
    );
  }

  return <TableEditorV2 restaurantId={restaurantId} editorMode="layout" />;
}
