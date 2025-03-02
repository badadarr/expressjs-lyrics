import express from "express";
import { chromium } from "playwright";

const app = express();
const port = 3000;

// Endpoint UI untuk input bulk dan export CSV dengan perbandingan deteksi bahasa
app.get("/bulk", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bulk Lyrics Scraper with Language Detection</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        textarea { width: 100%; height: 150px; }
        table, th, td { border: 1px solid #ccc; border-collapse: collapse; padding: 8px; }
        table { width: 100%; margin-top: 20px; }
        .error { color: red; }
        .success { color: green; }
        .language-compare { 
          margin-top: 5px;
          padding: 5px;
          background-color: #f9f9f9;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .agreement {
          font-weight: bold;
          margin-top: 8px;
        }
        .agree { color: green; }
        .disagree { color: orange; }
        .tabs {
          display: flex;
          margin-bottom: 10px;
        }
        .tab {
          padding: 10px 15px;
          cursor: pointer;
          border: 1px solid #ccc;
          background-color: #f1f1f1;
          margin-right: 5px;
        }
        .tab.active {
          background-color: #e0e0e0;
          border-bottom: 2px solid #4CAF50;
        }
        .tab-content {
          display: none;
          border: 1px solid #ccc;
          padding: 15px;
        }
        .tab-content.active {
          display: block;
        }
        .lang-pill {
          display: inline-block;
          padding: 2px 8px;
          margin: 2px;
          border-radius: 12px;
          background-color: #e0e0e0;
          font-size: 0.8em;
        }
        .lang-probability {
          font-size: 0.9em;
          color: #555;
        }
        pre {
          white-space: pre-wrap;
          max-height: 150px;
          overflow-y: auto;
        }
        .collapsible {
          cursor: pointer;
          padding: 5px;
          background-color: #f1f1f1;
          width: 100%;
          text-align: left;
          border: none;
          outline: none;
        }
        .content {
          display: none;
          overflow: hidden;
          background-color: #f9f9f9;
          padding: 0 18px;
        }
      </style>
    </head>
    <body>
      <h1>Bulk Lyrics Scraper with Language Detection</h1>
      
      <div class="tabs">
        <div class="tab active" data-tab="bulk-scrape">Bulk Scrape</div>
      </div>
      
      <div id="bulk-scrape" class="tab-content active">
        <p>Masukkan setiap pasangan Title dan Artist dalam satu baris, dipisahkan dengan koma.<br>Contoh: <code>Judul Lagu, Nama Artis</code></p>
        <textarea id="bulkInput" placeholder="Judul Lagu, Nama Artis"></textarea><br>
        <button id="processBtn">Proses</button>
        <button id="exportBtn" style="display:none;">Export CSV</button>
        <div id="result"></div>
      </div>
      <script>
        // Tab functionality
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
          tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to current tab and content
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
          });
        });
        
        // Bulk scraping functionality
        const processBtn = document.getElementById('processBtn');
        const exportBtn = document.getElementById('exportBtn');
        const bulkInput = document.getElementById('bulkInput');
        const resultDiv = document.getElementById('result');
        let results = [];

        processBtn.addEventListener('click', async () => {
          resultDiv.innerHTML = '';
          results = [];
          const lines = bulkInput.value.split('\\n').filter(line => line.trim());
          if (!lines.length) {
            resultDiv.innerHTML = '<p class="error">Input tidak boleh kosong.</p>';
            return;
          }
          
          // Tampilkan loading
          resultDiv.innerHTML = '<p>Proses scraping, harap tunggu...</p>';

          for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length < 2) continue;
            const title = parts[0].trim();
            const artist = parts[1].trim();

            try {
              const response = await fetch(\`/lyrics?title=\${encodeURIComponent(title)}&artist=\${encodeURIComponent(artist)}\`);
              const data = await response.json();
              if (data.error) {
                results.push({ title, artist, lyrics: 'Error: ' + data.error, languageDetectionResults: null });
              } else {
                results.push(data);
              }
            } catch (err) {
              results.push({ title, artist, lyrics: 'Error: ' + err.message, languageDetectionResults: null });
            }
          }

          // Tampilkan hasil dalam tabel
          let html = '<table><thead><tr><th>Title</th><th>Artist</th><th>Language Detection</th><th>Lyrics</th></tr></thead><tbody>';
          results.forEach(r => {
            html += '<tr>';
            html += '<td>' + r.title + '</td>';
            html += '<td>' + r.artist + '</td>';
            
            // Language detection section
            if (r.language) {
              html += '<td>';
              html += '<div><strong>TinyLD:</strong> ';
              html += '<span class="lang-pill">' + r.language.name + '</span> ';
              html += '<span class="lang-probability">(' + (r.language.probability * 100).toFixed(2) + '%)</span>';
              html += '</div>';
              html += '</td>';
            } else {
              html += '<td>N/A</td>';
            }
            
            // Lyrics column
            html += '<td><pre>' + r.lyrics + '</pre></td>';
            html += '</tr>';
          });
          html += '</tbody></table>';
          resultDiv.innerHTML = html;
          exportBtn.style.display = 'inline';
        });

        exportBtn.addEventListener('click', () => {
          let csvContent = "data:text/csv;charset=utf-8,Title,Artist,Detected Language,Confidence,Lyrics\\n";
          results.forEach(row => {
            // Escape quotes in lyrics
            const lyrics = row.lyrics.replace(/"/g, '""');
            
            // Set default values
            let lang = 'N/A', conf = '';
            
            // Extract language detection results if available
            if (row.language) {
              lang = row.language.name;
              conf = (row.language.probability * 100).toFixed(2) + '%';
            }
            
            csvContent += \`"\${row.title}","\${row.artist}","\${lang}","\${conf}","\${lyrics}"\\n\`;
          });
          
          const encodedUri = encodeURI(csvContent);
          const link = document.createElement("a");
          link.setAttribute("href", encodedUri);
          link.setAttribute("download", "lyrics_with_language.csv");
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
        
        // Language test functionality
        const testBtn = document.getElementById('testBtn');
        const textInput = document.getElementById('textInput');
        const testResultDiv = document.getElementById('testResult');
        
        testBtn.addEventListener('click', async () => {
          const text = textInput.value.trim();
          if (!text) {
            testResultDiv.innerHTML = '<p class="error">Text tidak boleh kosong.</p>';
            return;
          }
          
          testResultDiv.innerHTML = '<p>Mendeteksi bahasa, harap tunggu...</p>';
          
          try {
            const response = await fetch('/test-language', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ text })
            });
            
            const result = await response.json();
            
            if (result.error) {
              testResultDiv.innerHTML = '<p class="error">Error: ' + result.error + '</p>';
              return;
            }
            
            // Display detailed results
            let html = '<div class="language-compare">';
            
            // Text preview
            html += '<div><strong>Text Preview:</strong> ' + result.text + '</div>';
            html += '<div><strong>Text Length:</strong> ' + result.textLength + ' characters</div>';
            html += '<hr>';
            
            // TinyLD results
            html += '<div><strong>TinyLD Results:</strong></div>';
            html += '<div>Main language: <span class="lang-pill">' + result.tinyld.mainLanguageName + '</span></div>';
            html += '<div>Other detected languages:</div><ul>';
            result.tinyld.detectedLanguages.forEach(lang => {
              html += '<li><span class="lang-pill">' + lang.name + '</span> <span class="lang-probability">(' + (lang.accuracy * 100).toFixed(2) + '%)</span></li>';
            });
            html += '</ul>';
            
            html += '</div>'; // End language-compare div
            
            testResultDiv.innerHTML = html;
          } catch (err) {
            testResultDiv.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
