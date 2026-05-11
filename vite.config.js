import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'project-persistence-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url.startsWith('/api/projects')) {
            const projectsDir = path.resolve(__dirname, 'projects');
            if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });

            res.setHeader('Content-Type', 'application/json');

            // GET /api/projects - List all projects
            if (req.method === 'GET' && req.url === '/api/projects') {
              try {
                const files = fs.readdirSync(projectsDir);
                const projects = files
                  .filter(f => f.endsWith('.json') && !f.endsWith('.assets.json'))
                  .map(f => {
                    try {
                      const content = fs.readFileSync(path.join(projectsDir, f), 'utf-8');
                      const p = JSON.parse(content);
                      return { 
                        id: p.id, 
                        name: p.name || 'Untitled', 
                        lastSaved: p.lastSaved || new Date().toISOString() 
                      };
                    } catch (e) { return null; }
                  })
                  .filter(Boolean)
                  .sort((a, b) => new Date(b.lastSaved) - new Date(a.lastSaved));
                
                res.end(JSON.stringify(projects));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to list projects' }));
              }
              return;
            }

            // GET /api/projects/:id/assets - Load assets sidecar
            const assetsLoadMatch = req.url.match(/\/api\/projects\/([^\/]+)\/assets$/);
            if (req.method === 'GET' && assetsLoadMatch) {
              const id = assetsLoadMatch[1];
              const filePath = path.join(projectsDir, `${id}.assets.json`);
              if (fs.existsSync(filePath)) {
                res.end(fs.readFileSync(filePath, 'utf-8'));
              } else {
                res.end(JSON.stringify({ sprites: [], tilesets: [], sounds: [] }));
              }
              return;
            }

            // POST /api/projects/:id/assets - Save assets sidecar
            if (req.method === 'POST' && assetsLoadMatch) {
              const id = assetsLoadMatch[1];
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  // Validate shape before writing — assets payloads can be large
                  // and we want to fail fast on malformed JSON.
                  JSON.parse(body);
                  fs.writeFileSync(path.join(projectsDir, `${id}.assets.json`), body);
                  res.end(JSON.stringify({ success: true }));
                } catch (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }

            // DELETE /api/projects/:id/assets - Delete assets sidecar
            if (req.method === 'DELETE' && assetsLoadMatch) {
              const id = assetsLoadMatch[1];
              const filePath = path.join(projectsDir, `${id}.assets.json`);
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              res.end(JSON.stringify({ success: true }));
              return;
            }

            // GET /api/projects/:id - Load a specific project
            const loadMatch = req.url.match(/\/api\/projects\/([^\/]+)$/);
            if (req.method === 'GET' && loadMatch) {
              const id = loadMatch[1];
              const filePath = path.join(projectsDir, `${id}.json`);
              if (fs.existsSync(filePath)) {
                res.end(fs.readFileSync(filePath, 'utf-8'));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Project not found' }));
              }
              return;
            }

            // POST /api/projects - Save or Update a project
            if (req.method === 'POST' && req.url === '/api/projects') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const project = JSON.parse(body);
                  if (!project.id) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Project ID is required' }));
                    return;
                  }
                  fs.writeFileSync(
                    path.join(projectsDir, `${project.id}.json`),
                    JSON.stringify(project, null, 2)
                  );
                  res.end(JSON.stringify({ success: true }));
                } catch (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }

            // DELETE /api/projects/:id - Delete a project (and its assets sidecar)
            const deleteMatch = req.url.match(/\/api\/projects\/([^\/]+)$/);
            if (req.method === 'DELETE' && deleteMatch) {
              const id = deleteMatch[1];
              const filePath = path.join(projectsDir, `${id}.json`);
              const assetsPath = path.join(projectsDir, `${id}.assets.json`);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                if (fs.existsSync(assetsPath)) fs.unlinkSync(assetsPath);
                res.end(JSON.stringify({ success: true }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Project not found' }));
              }
              return;
            }
            return;
          }

          // GET /api/settings - Load global settings
          if (req.method === 'GET' && req.url === '/api/settings') {
            res.setHeader('Content-Type', 'application/json');
            const settingsPath = path.resolve(__dirname, 'settings.json');
            if (fs.existsSync(settingsPath)) {
              res.end(fs.readFileSync(settingsPath, 'utf-8'));
            } else {
              res.end(JSON.stringify({ builderName: 'TUI Builder', theme: 'theme-nano' }));
            }
            return;
          }

          // POST /api/settings - Save global settings
          if (req.method === 'POST' && req.url === '/api/settings') {
            res.setHeader('Content-Type', 'application/json');
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              const settingsPath = path.resolve(__dirname, 'settings.json');
              fs.writeFileSync(settingsPath, body);
              res.end(JSON.stringify({ success: true }));
            });
            return;
          }

          next();
        });
      }
    }
  ],
  server: {
    port: 3001,
    open: true
  }
})