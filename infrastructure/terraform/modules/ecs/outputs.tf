output "cluster_id" {
  description = "ECS Cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "ECS Cluster Name"
  value       = aws_ecs_cluster.main.name
}

output "task_definition_family" {
  description = "Task Definition Family"
  value       = aws_ecs_task_definition.app.family
}

output "service_name" {
  description = "ECS Service Name"
  value       = aws_ecs_service.app.name
}

output "log_group_name" {
  description = "CloudWatch Log Group Name"
  value       = aws_cloudwatch_log_group.ecs.name
}
