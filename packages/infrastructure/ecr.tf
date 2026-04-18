resource "aws_ecr_repository" "renderer" {
  name                 = "visual-resumes-renderer"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_repository" "image_resizer" {
  name                 = "visual-resumes-image-resizer"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

locals {
  ecr_keep_last_10 = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 tagged images"
      selection = {
        tagStatus      = "tagged"
        tagPatternList = ["*"]
        countType      = "imageCountMoreThan"
        countNumber    = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "renderer" {
  repository = aws_ecr_repository.renderer.name
  policy     = local.ecr_keep_last_10
}

resource "aws_ecr_lifecycle_policy" "image_resizer" {
  repository = aws_ecr_repository.image_resizer.name
  policy     = local.ecr_keep_last_10
}
