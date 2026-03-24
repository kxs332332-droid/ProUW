import React from 'react';
import { X, Search } from 'lucide-react';

interface ResourceViewerProps {
  url: string;
  type?: string;
  onClose: () => void;
  search: string;
  onSearchChange: (val: string) => void;
}

export const ResourceViewer: React.FC<ResourceViewerProps> = ({ url, type, onClose, search, onSearchChange }) => {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (url.startsWith('data:application/pdf')) {
      // Convert data URL to blob URL for better iframe compatibility
      const parts = url.split(',');
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      const newBlobUrl = URL.createObjectURL(blob);
      setBlobUrl(newBlobUrl);
      return () => URL.revokeObjectURL(newBlobUrl);
    } else {
      setBlobUrl(null);
    }
  }, [url]);

  // Helper to process common cloud storage links for iframes
  const getEmbedUrl = (originalUrl: string) => {
    let processedUrl = originalUrl;
    
    if (blobUrl) {
      return blobUrl;
    }

    // Handle Google Drive links
    if (processedUrl.includes('drive.google.com/file/d/')) {
      processedUrl = processedUrl.replace('/view', '/preview').replace('/edit', '/preview');
    }
    // Handle Dropbox links
    else if (processedUrl.includes('dropbox.com') && processedUrl.endsWith('?dl=0')) {
      processedUrl = processedUrl.replace('?dl=0', '?raw=1');
    }

    if (search.trim() && !processedUrl.startsWith('data:')) {
      return `${processedUrl}#search=${encodeURIComponent(search)}`;
    }
    return processedUrl;
  };

  const isPdf = type === 'PDF' ||
                url.toLowerCase().includes('.pdf') || 
                url.includes('/preview') || 
                url.includes('drive.google.com') || 
                url.includes('dropbox.com') ||
                url.includes('blob:') ||
                url.startsWith('data:application/pdf');

  console.log('ResourceViewer loading URL:', url, 'as PDF:', isPdf);

  return (
    <div className="flex flex-col h-full border-l-4 border-black bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.1)]">
      <div className="p-4 border-b-2 border-black flex justify-between items-center bg-zinc-50">
        <div className="flex items-center gap-4 flex-1 mr-4">
          <h3 className="font-black uppercase italic tracking-tighter whitespace-nowrap">Resource Viewer</h3>
          {isPdf && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="text" 
                placeholder="Find words in document..." 
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-black rounded-lg text-sm focus:outline-none"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors text-zinc-600"><X size={24} /></button>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden bg-zinc-100 flex flex-col">
        <div className="flex-1 relative">
          {isPdf ? (
            <iframe 
              src={getEmbedUrl(url)} 
              className="w-full h-full border-none"
              title="Resource PDF"
              allow="autoplay; fullscreen"
            />
          ) : (
            <div className="w-full h-full overflow-auto p-4 flex justify-center items-start">
              <img 
                src={url} 
                alt="Resource" 
                className="max-w-full shadow-2xl border-4 border-black rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
