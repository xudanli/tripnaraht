import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserProfileDto, GetUserProfileResponseDto } from './dto/user-profile.dto';
import { GetUsersQueryDto, UserListResponseDto, UserResponseDto, UpdateUserDto } from './dto/admin-user.dto';
import { CurrentUserResponseDto, UpdateCurrentUserDto, DeleteAccountResponseDto } from './dto/current-user.dto';
import { UserStatsResponseDto, UserDetailResponseDto } from './dto/user-stats.dto';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    getCurrentUser(userId: string): Promise<CurrentUserResponseDto>;
    updateCurrentUser(userId: string, dto: UpdateCurrentUserDto): Promise<CurrentUserResponseDto>;
    deleteCurrentUser(userId: string, confirmText?: string): Promise<DeleteAccountResponseDto>;
    getProfile(userId: string): Promise<GetUserProfileResponseDto>;
    updateProfile(userId: string, dto: UpdateUserProfileDto): Promise<GetUserProfileResponseDto>;
    getUsers(query: GetUsersQueryDto): Promise<UserListResponseDto>;
    getUserById(userId: string): Promise<UserResponseDto>;
    updateUser(userId: string, dto: UpdateUserDto): Promise<UserResponseDto>;
    deleteUser(userId: string): Promise<DeleteAccountResponseDto>;
    getUserStats(): Promise<UserStatsResponseDto>;
    getUserDetail(userId: string): Promise<UserDetailResponseDto>;
}
