variable "repository_name" {
  description = "ECR Repository Name"
  type        = string
  default     = "node-microservice"
}

resource "aws_ecr_repository" "app" {
  name = var.repository_name

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

output "repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "repository_arn" {
  value = aws_ecr_repository.app.arn
}
