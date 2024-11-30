class GithubPDFConverter {
    constructor(username, repo, branch, includeEmpty) {
        this.username = username;
        this.repo = repo;
        this.branch = branch;
        this.includeEmpty = includeEmpty;
        this.jsPDF = window.jspdf.jsPDF;
        this.doc = new this.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        this.verticalPosition = 20;
        this.pageHeight = this.doc.internal.pageSize.height - 20;
        this.directoryStructure = {};
        this.token = ''; // Optional: Add GitHub Personal Access Token for higher rate limits
        this.generationDate = new Date();
    }

    resetVerticalPosition() {
        this.verticalPosition = 20;
    }

    addNewPageIfNeeded(requiredHeight = 10) {
        if (this.verticalPosition + requiredHeight > this.pageHeight) {
            this.doc.addPage();
            this.resetVerticalPosition();
        }
    }

    async fetchRepoContents(path = '') {
        const apiUrl = `https://api.github.com/repos/${this.username}/${this.repo}/contents/${path}?ref=${this.branch}`;
        const headers = this.token ? { 'Authorization': `token ${this.token}` } : {};
        
        const response = await fetch(apiUrl, { headers });
        if (!response.ok) throw new Error('Failed to fetch repository contents');
        return await response.json();
    }

    async processDirectory(path = '', depth = 0) {
        const contents = await this.fetchRepoContents(path);
        
        // Build directory structure
        if (depth === 0) {
            this.directoryStructure = {};
            this.buildDirectoryStructure(contents, '');
        }
        
        for (const item of contents) {
            // Skip if not including empty directories and directory is empty
            if (item.type === 'dir') {
                const dirContents = await this.fetchRepoContents(item.path);
                if (!this.includeEmpty && dirContents.length === 0) continue;
                
                // Add directory name with indentation
                this.addText(`${'  '.repeat(depth)}directory: ${item.path}`, 10, null, 8);
                
                // Recursively process subdirectory
                await this.processDirectory(item.path, depth + 1);
            } else if (item.type === 'file') {
                // Check for multimedia files
                const multimediaExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.mp4', '.mov', '.avi', '.mp3', '.wav'];
                const isMultimedia = multimediaExtensions.some(ext => item.path.toLowerCase().endsWith(ext));

                // Check for license files
                const licenseExtensions = ['license', 'licence', '.md', '.txt'];
                const isLicense = licenseExtensions.some(ext => 
                    item.path.toLowerCase().includes(ext) && 
                    (item.name.toLowerCase().includes('license') || 
                     item.name.toLowerCase().includes('licence'))
                );

                // Add file name with indentation
                if (isMultimedia) {
                    this.addText(`${'  '.repeat(depth)}multimedia file: ${item.path}`, 10, null, 8);
                } else if (isLicense) {
                    this.addText(`${'  '.repeat(depth)}license file: ${item.path}`, 10, null, 8);
                    
                    // Fetch and add license file contents
                    try {
                        const fileResponse = await fetch(item.download_url);
                        const fileContent = await fileResponse.text();
                        
                        // Add file contents
                        this.addText(fileContent, 15, true, 7);
                    } catch (error) {
                        this.addText(`Error reading file: ${error.message}`, 15, false, 8, 'red');
                    }
                } else {
                    // Add file name with indentation
                    this.addText(`${'  '.repeat(depth)}file: ${item.path}`, 10, null, 8);
                    
                    // Fetch and add file contents
                    try {
                        const fileResponse = await fetch(item.download_url);
                        const fileContent = await fileResponse.text();
                        
                        // Add file contents
                        this.addText(fileContent, 15, true, 7);
                    } catch (error) {
                        this.addText(`Error reading file: ${error.message}`, 15, false, 8, 'red');
                    }
                }
            }
        }
    }

    buildDirectoryStructure(contents, basePath = '') {
        contents.forEach(item => {
            const fullPath = basePath ? `${basePath}/${item.name}` : item.name;
            
            if (item.type === 'dir') {
                this.directoryStructure[fullPath] = {
                    type: 'directory',
                    contents: {}
                };
            } else {
                const parentPath = basePath || '.';
                if (!this.directoryStructure[parentPath]) {
                    this.directoryStructure[parentPath] = { type: 'directory', contents: {} };
                }
                this.directoryStructure[parentPath].contents[item.name] = { type: 'file' };
            }
        });
    }

    printDirectoryStructure() {
        const structureText = this.formatDirectoryStructure(this.directoryStructure);
        this.addText('Directory Structure:', 10, null, 10);
        this.addText(structureText, 15, null, 8);
    }

    formatDirectoryStructure(structure, indent = '') {
        let result = '';
        Object.entries(structure).forEach(([path, item]) => {
            if (item.type === 'directory') {
                result += `${indent}📁 ${path}/\n`;
                const subIndent = indent + '  ';
                const subStructure = this.formatDirectoryStructure(item.contents, subIndent);
                result += subStructure;
            } else {
                result += `${indent}📄 ${path}\n`;
            }
        });
        return result;
    }

    addText(text, indent = 10, isCode = false, fontSize = 9, color = 'black') {
        // Ensure we have a page to work with
        this.addNewPageIfNeeded(10);

        // Set font properties
        this.doc.setFontSize(fontSize);
        this.doc.setTextColor(color);

        // Set font for code vs regular text
        if (isCode) {
            this.doc.setFont('courier', 'normal');
        } else {
            this.doc.setFont('helvetica', 'normal');
        }

        // Split text to handle long content
        const maxWidth = 180;
        const splitText = this.doc.splitTextToSize(text, maxWidth);
        
        // Add text with line breaks and indentation
        splitText.forEach(line => {
            // Check if we need a new page
            this.addNewPageIfNeeded(this.doc.getLineHeight());

            this.doc.text(line, indent, this.verticalPosition, {
                maxWidth: maxWidth,
                align: 'left'
            });

            // Update vertical position with reduced line spacing
            this.verticalPosition += this.doc.getLineHeight() * 0.8;
        });

        // Add minimal space between sections
        this.verticalPosition += 5;
    }

    async generatePDF() {
        // Title page
        this.doc.setFontSize(14);
        this.doc.text(`Repository: ${this.username}/${this.repo}`, 10, this.verticalPosition);
        this.verticalPosition += 8;
        
        this.doc.setFontSize(10);
        this.doc.text(`Branch: ${this.branch}`, 10, this.verticalPosition);
        this.verticalPosition += 10;

        // Print directory structure
        this.printDirectoryStructure();

        // Process repository contents
        await this.processDirectory();

        // Add watermark and generation time to the last page
        const pageCount = this.doc.internal.getNumberOfPages();
        this.doc.setPage(pageCount);
        this.doc.setTextColor(150);
        this.doc.setFontSize(10);
        
        const formattedDate = this.generationDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        const watermarkText = `PDF generated on ${formattedDate} on RepoToPDF.com`;
        this.doc.text(watermarkText, 10, this.pageHeight - 10, { align: 'left' });

        return this.doc;
    }
}

document.getElementById('repoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const repoUrl = document.getElementById('repoUrl').value;
    const branch = document.getElementById('branch').value || 'main';
    const includeEmpty = document.getElementById('includeEmpty').checked;
    const statusEl = document.getElementById('status');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const convertButton = document.getElementById('convertButton');

    // Validate GitHub repository URL
    const githubRegex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)$/;
    const match = repoUrl.match(githubRegex);
    
    if (!match) {
        statusEl.textContent = 'Invalid GitHub repository URL';
        statusEl.classList.add('text-red-500');
        return;
    }

    const [, username, repo] = match;

    try {
        // Disable button and show loading
        convertButton.disabled = true;
        convertButton.textContent = 'Converting...';
        statusEl.textContent = '';
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = 'Initializing...';

        // Create PDF converter
        const converter = new GithubPDFConverter(username, repo, branch, includeEmpty);

        // Generate PDF
        const doc = await converter.generatePDF();

        // Save PDF
        doc.save(`${repo}_full_contents.pdf`);

        progressBar.style.width = '100%';
        progressText.textContent = 'PDF generated successfully!';
        statusEl.textContent = 'PDF generated successfully!';
        statusEl.classList.remove('text-red-500');
    } catch (error) {
        console.error(error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.classList.add('text-red-500');
        progressText.textContent = 'Conversion failed';
    } finally {
        // Reset button
        convertButton.disabled = false;
        convertButton.textContent = 'Convert to PDF';
    }
});