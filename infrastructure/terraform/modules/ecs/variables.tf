variable "image" {
  description = "ECR image URL"
  type        = string
}

variable "subnets" {
  description = "Subnets for ECS service"
  type        = list(string)
}

variable "target_group_arn" {
  description = "ALB target group ARN"
  type        = string
  default     = null
}

variable "security_groups" {
  description = "Security groups for ECS service"
  type        = list(string)
  default     = []
}

variable "prefix" {
  description = "Prefix for resource naming"
  type        = string
  default     = "payment-api"
}
