pipeline {
    agent any
    environment {
        IMAGE_NAME = "chatbot-devsecops-local"
        PATH = "/opt/homebrew/bin:/opt/homebrew/sbin:/opt/homebrew/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        JAVA_HOME = "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
    }
    stages {
        stage('Checkout SCM') {
            steps {
                checkout scm
                script {
                    env.IMAGE_TAG = sh(script: 'git rev-parse --short=7 HEAD', returnStdout: true).trim()
                }
            }
        }
        stage('Docker Build') {
            steps {
                sh '''
                    docker build \
                      -t ${IMAGE_NAME}:${IMAGE_TAG} \
                      -t ${IMAGE_NAME}:latest \
                      app/
                '''
            }
        }
        stage('Remove container') {
            steps {
                sh 'docker stop chatbot-local || true && docker rm chatbot-local || true'
            }
        }
        stage('Deploy to container') {
            steps {
                sh 'docker run -d --name chatbot-local -p 3000:3000 ${IMAGE_NAME}:${IMAGE_TAG}'
            }
        }
        stage('Health Check') {
            steps {
                sh '''
                    sleep 5
                    docker exec chatbot-local wget -qO- http://127.0.0.1:3000/api/health
                '''
            }
        }
    }
}
