resource "aws_ecs_cluster" "main" {
  name = "microservices-cluster"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "node-app"
  requires_compatibilities = ["FARGATE"]

  cpu    = "256"
  memory = "512"

  network_mode = "awsvpc"

  container_definitions = jsonencode([
    {
      name  = "node-app"
      image = var.image

      portMappings = [
        {
          containerPort = 3000
        }
      ]
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = "node-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2

  launch_type = "FARGATE"

  network_configuration {
    subnets = var.subnets
    assign_public_ip = true
  }
}