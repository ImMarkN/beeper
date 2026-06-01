terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Storage bucket for Cloud Function source code
resource "google_storage_bucket" "function_bucket" {
  name                        = "${var.project_id}-beeper-source"
  location                    = var.region
  uniform_bucket_level_access = true
}

# Service Account for the Function (Least Privilege)
resource "google_service_account" "beeper_sa" {
  account_id   = "beeper-function-sa"
  display_name = "Beeper Function Service Account"
}

# The Cloud Function (2nd Gen)
resource "google_cloudfunctions2_function" "beeper" {
  name        = "receiveMessage"
  location    = var.region
  description = "Beeper SMS alert forwarder"

  build_config {
    runtime     = "nodejs20"
    entry_point = "receiveMessage"
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = google_storage_object.source_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 5
    available_memory   = "256Mi"
    service_account_email = google_service_account.beeper_sa.email
    
    # Secure Secret Management: Map Secret Manager secrets to env vars
    secret_environment_variables {
      key        = "THREE_RINGS_API_KEY"
      project_id = var.project_id
      secret     = "THREE_RINGS_API_KEY"
      version    = "latest"
    }
    secret_environment_variables {
      key        = "TWILIO_ACCOUNT_SID"
      project_id = var.project_id
      secret     = "TWILIO_ACCOUNT_SID"
      version    = "latest"
    }
    secret_environment_variables {
      key        = "TWILIO_AUTH_TOKEN"
      project_id = var.project_id
      secret     = "TWILIO_AUTH_TOKEN"
      version    = "latest"
    }
    environment_variables = {
      WEBHOOK_URL = var.webhook_url
    }
  }
}

# The source code zip file (uploaded by the CI pipeline)
resource "google_storage_object" "source_zip" {
  name   = "source-${hashbase64(filemd5("dist.zip"))}.zip"
  bucket = google_storage_bucket.function_bucket.name
  source = "dist.zip"
}

# Allow public access for Twilio (the code handles signature validation)
resource "google_cloud_run_service_iam_member" "public_access" {
  location = google_cloudfunctions2_function.beeper.location
  project  = google_cloudfunctions2_function.beeper.project
  service  = google_cloudfunctions2_function.beeper.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}