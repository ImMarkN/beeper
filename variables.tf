variable "project_id" {
  description = "The GCP Project ID"
  type        = string
}

variable "region" {
  description = "The GCP Region"
  type        = string
  default     = "europe-west1"
}

variable "webhook_url" {
  description = "The public URL of the function (for Twilio validation)"
  type        = string
}