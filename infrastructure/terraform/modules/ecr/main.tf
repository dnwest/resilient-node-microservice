resource "aws_ecr_repository" "app" {
  name = "node-microservice"

  image_scanning_configuration {
    scan_on_push = true
  }
}