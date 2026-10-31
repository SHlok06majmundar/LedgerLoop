# Uploaded files live in a local upload folder behind a storage interface

Bank statements and generated invoice PDFs are written under `UPLOAD_DIR` on the API server, with keys namespaced by organization, and served only through authorized API routes, never as static files. Uploads go to the API as multipart requests instead of signed object-storage URLs. The host must give `UPLOAD_DIR` a persistent disk shared by the API and worker; the `FileStorage` interface is where an S3-compatible adapter would plug in later.
